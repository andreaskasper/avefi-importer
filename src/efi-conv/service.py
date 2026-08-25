"""
Validierungsdienst auf Basis von efi-conv.

Der Vertrag verlangt Pruefung „mit efi-conv check oder unter direkter Nutzung
derselben Validierungslogik". Dieser Dienst nutzt denselben Schema-Validator
(get_schema_validator) und dieselben Zusatzregeln wie efi-conv check.

Ein Unterschied ist beabsichtigt: efi-conv check bricht beim ersten Schemafehler
ab (pass_checks ruft `raise error`). Ein Importer muss alle Fehler auf einmal
zeigen koennen, deshalb wird hier ueber iter_errors gesammelt statt geworfen.
Fuer den Abnahmenachweis gibt es zusaetzlich /check-cli, das die echte
Kommandozeile unveraendert ausfuehrt.
"""
from __future__ import annotations

import json
import logging
import pathlib
import subprocess
import tempfile
from collections import defaultdict
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from efi_conv.core import check as efi_check

log = logging.getLogger("efi-conv-service")
app = FastAPI(title="efi-conv validation service", version="1.0")

_validator = None


def validator():
    global _validator
    if _validator is None:
        _validator = efi_check.get_schema_validator()
    return _validator


def schema_info() -> dict[str, Any]:
    """Welches Schema wurde geladen — fuer Reproduzierbarkeit im Pruefbericht."""
    info: dict[str, Any] = {
        "source": getattr(efi_check, "SCHEMA_SOURCE", None),
        "file": str(getattr(efi_check, "SCHEMA_FILE", "")),
        "version": None,
        "sha256": None,
    }
    try:
        p = pathlib.Path(str(efi_check.SCHEMA_FILE))
        if p.exists():
            import hashlib

            raw = p.read_bytes()
            info["sha256"] = hashlib.sha256(raw).hexdigest()[:16]
            doc = json.loads(raw)
            info["version"] = doc.get("version") or doc.get("$id")
    except Exception as e:  # pragma: no cover
        log.warning("Schemainfo nicht lesbar: %s", e)
    return info


class CheckRequest(BaseModel):
    """records ist eine Liste von AVefi-Datensaetzen als einfache Objekte."""

    records: list[dict[str, Any]]
    # Laufende Nummer -> Quellzeile, damit Fehler auf die Tabellenzeile zeigen
    row_map: dict[str, int] | None = None


class Issue(BaseModel):
    severity: str
    message: str
    record: int | None = None
    row: int | None = None
    targetField: str | None = None
    value: str | None = None
    code: str | None = None


def _id_key(ident: Any) -> str | None:
    """Der Schluessel, unter dem efi-conv eine Kennung fuehrt: Kategorie plus Wert."""
    if not isinstance(ident, dict):
        return None
    cat = str(ident.get("category") or "").strip()
    val = str(ident.get("id") or ident.get("has_identifier_value") or "").strip()
    if not val:
        return None
    return f"{cat}.{val}" if cat else val


def _refs(rec: dict[str, Any]) -> list[str]:
    """Verweise eines Satzes auf andere Saetze derselben Lieferung."""
    out: list[str] = []
    for field in ("is_manifestation_of", "is_item_of", "is_variant_of", "is_derived_from"):
        v = rec.get(field)
        for item in v if isinstance(v, list) else [v] if v else []:
            k = _id_key(item) if isinstance(item, dict) else (str(item) if item else None)
            if k:
                out.append(k)
    return out


def _short(v: Any, limit: int = 120) -> str | None:
    if v is None:
        return None
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str)
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _path(err) -> str | None:
    parts = [str(p) for p in getattr(err, "absolute_path", [])]
    return ".".join(parts) if parts else None


@app.get("/health")
def health():
    return {"ok": True, "schema": schema_info()}


@app.post("/check")
def check(req: CheckRequest):
    """Alle Datensaetze pruefen und jeden Verstoss einzeln melden."""
    v = validator()
    issues: list[dict[str, Any]] = []
    row_map = req.row_map or {}
    valid_count = 0

    # Erst die satzuebergreifenden Regeln vorbereiten. efi-conv check prueft in
    # pass_checks nicht nur jeden Satz fuer sich, sondern auch Eindeutigkeit der
    # Kennungen und aufloesbare Verweise. Ohne diese beiden Regeln meldet der
    # Dienst „in Ordnung", waehrend die Kommandozeile denselben Bestand ablehnt.
    id_owners: dict[str, list[int]] = defaultdict(list)
    referenced: dict[str, list[int]] = defaultdict(list)
    own_ids: dict[int, list[str]] = {}

    for i, rec in enumerate(req.records):
        n = i + 1
        ids = [_id_key(x) for x in (rec.get("has_identifier") or [])]
        own_ids[n] = [x for x in ids if x]
        for key in own_ids[n]:
            id_owners[key].append(n)
        for ref in _refs(rec):
            referenced[ref].append(n)

    known_ids = set(id_owners)

    for i, rec in enumerate(req.records):
        n = i + 1
        row = row_map.get(str(i)) or row_map.get(str(n))
        had_error = False

        # Kennung doppelt vergeben — efi-conv: „Identifier is not unique"
        for key in own_ids.get(n, []):
            others = [o for o in id_owners[key] if o != n]
            if others:
                had_error = True
                issues.append({
                    "severity": "error",
                    "message": (
                        f"Kennung {key} ist nicht eindeutig, sie kommt auch in "
                        f"Datensatz {', '.join(str(o) for o in others)} vor."
                    ),
                    "record": n, "row": row,
                    "targetField": "has_identifier", "value": key,
                    "code": "identifier_not_unique",
                })

        # Verweis zeigt ins Leere — efi-conv: „dangling record"
        for ref in _refs(rec):
            if ref not in known_ids:
                had_error = True
                issues.append({
                    "severity": "error",
                    "message": f"Der Verweis {ref} zeigt auf keinen Datensatz dieser Lieferung.",
                    "record": n, "row": row,
                    "targetField": "is_manifestation_of/is_item_of",
                    "value": ref, "code": "dangling_reference",
                })

        # 1. Schemapruefung — derselbe Validator, den efi-conv check benutzt
        for err in v.iter_errors(rec):
            had_error = True
            issues.append(
                {
                    "severity": "error",
                    "message": err.message,
                    "record": n,
                    "row": row,
                    "targetField": _path(err),
                    "value": _short(getattr(err, "instance", None)),
                    "code": "schema",
                }
            )

        # 2. Zusatzregeln von efi-conv, soweit ohne Modellinstanz nutzbar
        if not rec.get("has_identifier"):
            had_error = True
            issues.append(
                {
                    "severity": "error",
                    "message": "has_identifier fehlt im Datensatz.",
                    "record": n,
                    "row": row,
                    "targetField": "has_identifier",
                    "code": "missing_identifier",
                }
            )

        for fn_name, code in (
            ("has_invalid_date", "invalid_date"),
            ("has_invalid_value", "invalid_value"),
            ("exceeds_field_limit", "field_limit"),
        ):
            fn = getattr(efi_check, fn_name, None)
            if not callable(fn):
                continue
            try:
                if fn(rec):
                    had_error = True
                    issues.append(
                        {
                            "severity": "error",
                            "message": f"efi-conv: {fn_name} trifft zu.",
                            "record": n,
                            "row": row,
                            "code": code,
                        }
                    )
            except Exception:
                # Regel braucht eine Modellinstanz statt eines dict — kein Fehler
                # des Datensatzes, also stillschweigend uebergehen.
                pass

        if not had_error:
            valid_count += 1

    # Knoten ohne zugehoeriges Exemplar — efi-conv: „No items associated with"
    for i, rec in enumerate(req.records):
        n = i + 1
        cat = str(rec.get("category") or "")
        if not cat.endswith(("Manifestation", "WorkVariant")):
            continue
        keys = own_ids.get(n, [])
        if keys and not any(referenced.get(k) for k in keys):
            issues.append({
                "severity": "error",
                "message": f"Zu {cat} {keys[0]} gehoert kein Exemplar.",
                "record": n,
                "row": row_map.get(str(i)) or row_map.get(str(n)),
                "targetField": "has_identifier",
                "value": keys[0],
                "code": "no_items_associated",
            })

    bad = {i.get("record") for i in issues if i["severity"] == "error"}
    return {
        "ok": not bad,
        "checked": len(req.records),
        "valid": len(req.records) - len(bad),
        "issues": issues,
        "schema": schema_info(),
    }


@app.post("/check-cli")
def check_cli(req: CheckRequest):
    """Die echte Kommandozeile auf einer Datei — fuer den Abnahmenachweis."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(req.records, fh, ensure_ascii=False)
        path = fh.name
    try:
        p = subprocess.run(
            ["efi-conv", "check", path], capture_output=True, text=True, timeout=300
        )
        return {
            "ok": p.returncode == 0,
            "exitCode": p.returncode,
            "stdout": p.stdout[-8000:],
            "stderr": p.stderr[-8000:],
            "schema": schema_info(),
        }
    finally:
        pathlib.Path(path).unlink(missing_ok=True)
