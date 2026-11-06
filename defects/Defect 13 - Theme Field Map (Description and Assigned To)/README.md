# Defect 13 — Theme: Description & Assigned To not mapped from ADO

- **ADO work item:** 270029 / 270032
- **Status:** ✅ RESOLVED (Test) — 11/06/2026
- **Update set (config):** `MECK - AT - 270029 270032 - THEME UAT`

## The defect

On Themes (`scrum_theme`), the ADO **Description** and **Assigned To** were not
showing. Testers expected both to carry over from the ADO Feature the theme maps to.

## Root cause & fix

### Description — DATA gap (backfilled)

The theme table map **does** carry `description <- System.Description`, but existing
themes were never (re)processed by the incremental import, so Description stayed
blank even where ADO had one. Measured: **289** themes had an ADO description but a
blank SN value.

- **Fix:** `src/background_scripts/defect13_theme_description_backfill.js` pulls
  `System.Description` from ADO in batches and sets `scrum_theme.description`. Run as
  DATA (not update-set tracked) — `DRY_RUN=true` first, then `false`.
- **Result:** backfilled; 314 themes now have descriptions. Spot check THME0011072 →
  2,615-char description (was blank).

### Assigned To — CONFIG (no native field)

`scrum_theme` is a **standalone table** (`super_class` empty) with **no native
`assigned_to` field**. There is nothing to map to and nothing to backfill. The ADO
assignee is already captured by the integration in the **custom reference field
`u_ado_assigned_to`** (reference `sys_user`, read-only).

So this is a config/labeling fix, not a data one — surface that existing field:

- Renamed `u_ado_assigned_to` dictionary **column_label** "ADO Assigned to" →
  **"Assigned to"** (its `sys_documentation` label was already "Assigned to").
- Added `u_ado_assigned_to` to the **Default view** form section (it was only on the
  Scrum view). Form layout captured via the slushbucket re-save.
- Captured in update set `MECK - AT - 270029 270032 - THEME UAT`:
  `sys_dictionary`, `sys_documentation`, `sys_ui_section`.
- Verified: `onViews = ["Scrum","Default view"]`, docLabel = "Assigned to".

## Why not a native assigned_to on scrum_theme

Adding a native `assigned_to` would mean a new field + a field-map row + a full
reprocess/backfill, duplicating data the integration already lands in
`u_ado_assigned_to`. Relabeling the existing field is the minimal, integration-safe
fix (decision: "option b").

## TODO (per environment)
- Re-run `defect13_theme_description_backfill.js` in Dev/other envs (data not tracked).
- Migrate update set `MECK - AT - 270029 270032 - THEME UAT` for the config.
