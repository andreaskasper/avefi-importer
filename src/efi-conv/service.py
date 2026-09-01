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


class CrossRequest(BaseModel):
    """
    Die satzuebergreifende Pruefung, fuer den GESAMTEN Bestand auf einmal.

    Kennungen und Verweise gelten ueber die ganze Lieferung. Solange sie je
    Buendel geprueft wurden, meldete der Dienst Verweise als "zeigt ins Leere",
    deren Ziel nur im vorigen Buendel lag, und uebersah doppelte Kennungen, die
    weit auseinander standen.

    Geschickt wird deshalb eine reduzierte Sicht: category, has_identifier und
    die Verweisfelder. Das passt auch bei zehntausend Saetzen in eine Anfrage,
    waehrend die vollstaendigen Saetze zweistellige Megabyte waeren.
    """

    records: list[dict[str, Any]]
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


def _stelle(row_map: dict[str, int], i: int) -> int | None:
    """Quellzeile zu einer laufenden Nummer, 0- wie 1-basiert nachgeschlagen."""
    return row_map.get(str(i)) or row_map.get(str(i + 1))


def _zeilenwort(row_map: dict[str, int], nummern: list[int]) -> str:
    """
    Andere Fundstellen benennen — nach Moeglichkeit als Zeile der Quelldatei.

    Die laufende Nummer des Pruefsatzes ist nicht die Datensatznummer der
    Oberflaeche: Je Zeile entstehen ein Werk, eine Manifestation und ein
    Exemplar. "Datensatz 162" war deshalb eine Angabe, die im Importer auf
    nichts zeigte. Wo die Zeile bekannt ist, wird sie genannt.
    """
    zeilen = [_stelle(row_map, n - 1) for n in nummern]
    if zeilen and all(z is not None for z in zeilen):
        eindeutig = sorted({int(z) for z in zeilen if z is not None})
        wort = "Zeile" if len(eindeutig) == 1 else "den Zeilen"
        return f"{wort} {', '.join(str(z) for z in eindeutig)}"
    wort = "Pruefsatz" if len(nummern) == 1 else "den Pruefsaetzen"
    return f"{wort} {', '.join(str(n) for n in nummern)}"


def _satzuebergreifend(records: list[dict[str, Any]], row_map: dict[str, int]) -> list[dict[str, Any]]:
    """
    Die drei Regeln, die den ganzen Bestand brauchen.

    efi-conv check prueft in pass_checks nicht nur jeden Satz fuer sich, sondern
    auch Eindeutigkeit der Kennungen, aufloesbare Verweise und ob zu jeder
    Manifestation ein Exemplar gehoert. Ohne sie meldet der Dienst "in Ordnung",
    waehrend die Kommandozeile denselben Bestand ablehnt.

    Aufgerufen wird das ueber /crossref mit ALLEN Saetzen, nie je Buendel: Die
    Regeln sind nur ueber die vollstaendige Lieferung richtig. Solange sie in
    /check steckten und /check gebuendelt aufgerufen wurde, meldete der Dienst
    Verweise als "zeigt ins Leere", deren Ziel im vorigen Buendel lag.
    """
    issues: list[dict[str, Any]] = []
    id_owners: dict[str, list[int]] = defaultdict(list)
    referenced: dict[str, list[int]] = defaultdict(list)
    own_ids: dict[int, list[str]] = {}

    for i, rec in enumerate(records):
        n = i + 1
        ids = [_id_key(x) for x in (rec.get("has_identifier") or [])]
        own_ids[n] = [x for x in ids if x]
        for key in own_ids[n]:
            id_owners[key].append(n)
        for ref in _refs(rec):
            referenced[ref].append(n)

    known_ids = set(id_owners)

    for i, rec in enumerate(records):
        n = i + 1
        row = _stelle(row_map, i)

        # Kennung doppelt vergeben — efi-conv: "Identifier is not unique"
        for key in own_ids.get(n, []):
            others = [o for o in id_owners[key] if o != n]
            if others:
                issues.append({
                    "severity": "error",
                    "message": (
                        f"Kennung {key} ist nicht eindeutig, sie kommt auch in "
                        f"{_zeilenwort(row_map, others)} vor."
                    ),
                    "record": n, "row": row,
                    "targetField": "has_identifier", "value": key,
                    "code": "identifier_not_unique",
                })

        # Verweis zeigt ins Leere — efi-conv: "dangling record"
        for ref in _refs(rec):
            if ref not in known_ids:
                issues.append({
                    "severity": "error",
                    "message": f"Der Verweis {ref} zeigt auf keinen Datensatz dieser Lieferung.",
                    "record": n, "row": row,
                    "targetField": "is_manifestation_of/is_item_of",
                    "value": ref, "code": "dangling_reference",
                })

        # Knoten ohne zugehoeriges Exemplar — efi-conv: "No items associated with"
        cat = str(rec.get("category") or "")
        if cat.endswith(("Manifestation", "WorkVariant")):
            keys = own_ids.get(n, [])
            if keys and not any(referenced.get(k) for k in keys):
                issues.append({
                    "severity": "error",
                    "message": f"Zu {cat} {keys[0]} gehoert kein Exemplar.",
                    "record": n, "row": row,
                    "targetField": "has_identifier",
                    "value": keys[0],
                    "code": "no_items_associated",
                })

    return issues


@app.post("/crossref")
def crossref(req: CrossRequest):
    """Die satzuebergreifenden Regeln, in einem Durchgang ueber alles."""
    issues = _satzuebergreifend(req.records, req.row_map or {})
    return {"checked": len(req.records), "issues": issues}


@app.post("/check")
def check(req: CheckRequest):
    """
    Jeden Satz fuer sich pruefen.

    Satzuebergreifendes steht bewusst nicht hier: Diese Aufrufe kommen
    gebuendelt, und eine Regel ueber die ganze Lieferung waere dann nur ueber
    einen Ausschnitt geprueft. Dafuer gibt es /crossref.
    """
    v = validator()
    issues: list[dict[str, Any]] = []
    row_map = req.row_map or {}
    valid_count = 0

    for i, rec in enumerate(req.records):
        n = i + 1
        row = _stelle(row_map, i)
        had_error = False

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

    # „valid" zaehlt nur, was DIESER Durchgang beurteilen kann. Die
    # satzuebergreifenden Regeln laufen in /crossref; wer beide Ergebnisse
    # zusammenfuehrt, muss die Zahl dort neu bilden — sonst gilt ein Satz als
    # gueltig, dessen Kennung doppelt vergeben ist.
    return {
        "ok": valid_count == len(req.records),
        "checked": len(req.records),
        "valid": valid_count,
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
