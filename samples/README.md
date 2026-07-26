# Sample metadata files

Small example datasets (the same three films) in each supported source format —
useful for trying out the import pipeline. Upload one via the dashboard, then run
the worker (`detect` → `convert`).

| File | Format | Notes |
|------|--------|-------|
| `films.csv`     | CSV      | comma-separated, with a `work_type` column |
| `films.tsv`     | TSV      | tab-separated |
| `films.json`    | JSON     | array of objects |
| `films.marcxml` | MARC-XML | MARC 21 slim (`<collection>`/`<record>`) |
| `films.ead`     | EAD      | finding aid with three item-level components |

**Validation demo:** `films.csv` / `films.tsv` / `films.json` include a `work_type`
(Werkart) and therefore validate as **schema-valid**. `films.marcxml` / `films.ead`
have no clean work-type field, so those records show as **„ungültig"** (missing
Werkart) until a curator sets it in the editor — a good demonstration of the schema
validation catching a required field.
