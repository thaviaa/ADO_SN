# Defect 2b — Epics not mapped to a Project (spun off from Defect 2 retest)

- **ADO work item:** _(new defect — fill in)_ · lineage: Betsy's retest of Defect 2 (269821)
- **Tester:** Betsy Kinney
- **Status:** ✅ RESOLVED & VALIDATED (Test) — 11/05/2026, update set `MECK - AT - 269821 - EPIC UAT 2`
- **Origin:** Defect 2 (269821, "Epic ADO Number & story linking") passed for the ADO
  Number + story→epic work, but **failed retest** on a different point — the title
  didn't reflect the actual defect — so this was logged as a **new defect**: epics
  aren't associated with a Project in SN.

## Expected / Actual
- **Expected:** Each ADO epic is associated with its SN Project.
- **Actual:** Jack added a `u_project` field on `rm_epic` (reference `pm_project`) and
  an integration field map (External `System.AreaPath` → Internal `u_project`, lookup
  "Project Name"), ran the import — **it did not populate**.

## Root cause
Two compounding problems with the OOTB field-map approach:
1. **Wrong lookup column** — the field map looked up **"Project Name"** (`pm_project.name`),
   but that column is **empty**; the project's real display value is in
   **`short_description`**.
2. **Path vs. name mismatch** — it fed the full `System.AreaPath`
   (`ITS - ServiceNow\ITPMO - X`), which never equals a project name. Even the area
   **leaf** carries an `ITPMO - ` / `ITPMO – ` prefix that breaks an exact match, and
   many epics sit at the **root `ITS - ServiceNow` area** (above project granularity).

## Fix — derive, don't field-map
Resolve `rm_epic.u_project` the same way stories resolve their project:

- **Primary — area-based BR** `Set Epic Project from ADO area` (on `rm_epic`, async):
  epic external-id `ado_area` → `sn_ado_int_area.name` → leaf → strip `ITPMO - `
  prefix → match **`pm_project.short_description`**. Covers **136 of 192** epics.
- **Fallback — child-story BR** `Set Epic Project from child story` (on `rm_story`,
  async): for root-area epics (no single area → project), set the parent epic's
  `u_project` from a child story's project when empty.
- **Backfill** (`epic_project_area_backfill.js`, data): area-based, overwrites
  area-resolvable epics with the authoritative area value.

Both BRs set only when empty/changed, so they don't conflict.

### Result (Test)
- **143 of 192 epics** now have a Project (was 65). Area resolved 136; child BR fills
  no-area / root-area epics where the stories know the project; root epics with no
  derivable project stay empty (correct).
- **Validated — Cloud Landing Zone (PRJ0010017): 24 epics** on `u_project`
  (9 open + 15 Complete; a backlog view hiding Complete shows 9).
- Spot-checked across projects incl. en-dash areas: BCO→Cloud Landing Zone,
  DSS-CCS, Finance Data Integrations, FY26, BizTax — all correct.

## Files
- `src/business_rules/epic_set_project_from_area.js` — primary BR source
- `src/business_rules/epic_set_project_from_story.js` — fallback BR source
- `src/background_scripts/create_epic_project_area_br.js` — create primary BR
- `src/background_scripts/create_epic_project_br.js` — create fallback BR
- `src/background_scripts/epic_project_area_backfill.js` — area backfill (primary)
- `src/background_scripts/epic_project_backfill.js` — child-derived backfill
- `src/background_scripts/defect2_epic_project_map_check.js` — diagnostic

## Promotion
- **Config (update set `MECK - AT - 269821 - EPIC UAT 2`):** the `u_project` field,
  both business rules.
- **Data (re-run per env):** the backfills.

## Open / note
- The **Project Workspace Epics tab is story-derived** (lists epics of the project's
  stories, 20 for CLZ), so it does **not** use `u_project`. Switching that tab/related
  list to `u_project` (to show all 24) is a separate change if desired.
