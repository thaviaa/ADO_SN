# Test (mecknctest) runbook — ADO-SN config, import and backfills

Order of operations to rebuild the ADO ↔ ServiceNow work in **mecknctest** after the
11/14 clone, based on what was done in **meckncdev** on 11/16 (Sprint P59).

**Rule of thumb:** config (update sets) → ADO connection → import → backfills.
Data is **not** update-set tracked, so every backfill must be re-run in Test.
Every script defaults to `DRY_RUN = true`: run it dry, read the counts, then set `false`.
For long runs use **Proceed in Background** on the fix script (no browser timeout).

---

## 1. Config — move the update sets from Dev

In Test: **Retrieved Update Sets → retrieve from meckncdev → Preview → resolve
collisions → Commit.**

| Order | Update set | What's in it |
|---|---|---|
| 1 | `MECK - AT - 11_13 CLONE BATCH` (batch parent) | Theme ADO Number / Assigned To / Audit, Project on Story, Theme preview, ADO Number BRs, Defect 1/5/7 fixes, `ADOReconciliationUtil`, `ADOThemeBackfillUtil` |
| 2 | `MECK - AT - ADO_SN UAT - DEV PROMOTION BATCH` | `u_project` on Theme + Epic, Epic/Theme BRs, Create Agile Group module (Defect 11) |
| 3 | `MECK - AT - P59 ADO-SN REBUILD` | see below |
| 4 | `MECK - AT - P59 ADO-SN REBUILD - ADO APP` (child, ADO app scope) | 263762: story delete no longer deletes the ADO work item |
| — | `MECK -RD-ADO Mappings -Meck agile temp` (colleague's) | Epic + Feature→Theme field maps — **coordinate with the owner** |

`MECK - AT - P59 ADO-SN REBUILD` contains:
- `ADOWorkItemBackfillUtil`: name fix (leading space), comment order fix, OAuth provider
  **Microsoft Azure DevOps Boards OAuth**, alias `sn_azure_dev_spoke.Azure_DevOps_Boards`
- `ADOThemeBackfillUtil`: same provider/alias, writes to `description` (Theme has no `html_description`)
- Story (User Story → rm_story) field maps on **Meck-Agile-Template-1.0.0 map** and
  **ServiceNow-Template-1.0.0 map**: Description→`html_description`, Id→`u_ado_number`,
  Parent→`theme`, AreaPath→`project` (lookup `pm_project.u_ado_area_path`),
  CreatedBy/ChangedBy, and the 15-state custom State choice map
- `pm_project.u_ado_area_path` field
- Fix scripts: **ADO-SN Hierarchy Sync**, **ADO-SN Sprint and Release Backfill**,
  **ADO-SN Theme Parent Epic Sync**
- Themes related list on Epic (Scrum + Default); "Epics (Theme Parent Epic)" relationship
  on the Theme Scrum view; reactivated BR *Defect 4 - Set Theme Parent Epic from Feature parent (ADO)*
- Scheduled jobs (daily 6:15 / 6:45 AM ET): story Description/AC/Comments backfill, Theme description backfill
- Theme Description HTML → plain text: Script Include `ADOSNTextUtil`, BR *ADO-SN - Theme Description HTML to text*
  (scrum_theme, before insert/update), `ADOThemeBackfillUtil` writes through `ADOSNTextUtil().htmlToText(desc)`,
  fix script **ADO-SN Theme Description HTML Cleanup**

> ⚠️ **Field maps hang off process-mapping records.** If someone re-runs ADO process
> discovery in Test, it creates **new** map configs/table maps and the update-set field maps
> attach to the old ones (this happened in Dev on 11/16). After commit, open each project's
> Process Mapping (**Meck-Agile-Template-1.0.0**, **ServiceNow-Template-1.0.0**) → User Story
> table map and confirm the field maps + 15 state rows are on the table map **that's actually
> in use**. If not, recreate them there before importing.

## 2. ADO connection

1. Credential **Azure DevOps OAuth** → **Get OAuth Token**.
2. Scripts - Background: `new ADOWorkItemBackfillUtil().testAuth();` → expect HTTP 200.
   An `AADSTS900144 ... refresh_token` line before "Token obtained from connection alias"
   is harmless.
3. The stored access token lasts ~1 hour. If a later step logs
   *"All token retrieval strategies failed"* / *"ABORT: no ADO token"*, click
   **Get OAuth Token** again and re-run that step.

## 3. Import

1. Azure DevOps instance → **Discover Projects** (projects + areas + iterations).
2. **Import Work Items** for each ADO project. Wait until the import requests finish.

## 4. Backfills — in this order

| # | What | Type | Notes |
|---|---|---|---|
| 1 | `src/background_scripts/p59_project_area_backfill.js` | Background script | Project area paths (full path), then Project on stories + themes. Run **dry, then commit, then run again** (the 2nd pass picks up the area paths the 1st one wrote). |
| 2 | **Meck Backfill Themes ADO number** | Fix script | SN-only, quick. |
| 3 | **ADO-SN Hierarchy Sync (Story to Theme and Epic)** | Fix script | Dry/`LIMIT=100` → commit `LIMIT=100` + `STAMP_ADO_NUMBERS=true` → `LIMIT=0`. |
| 4 | **ADO-SN Theme Parent Epic Sync** | Fix script | Theme → parent Epic (one Epic, many Themes). Dry → `LIMIT=100` → `LIMIT=0`. |
| 5 | **ADO Theme Backfill** | Fix script | Feature Description → Theme. |
| 6 | `defect2_theme_short_description_backfill.js` | Background script | Theme Short description from Name. |
| 6a | **ADO-SN Theme Description HTML Cleanup** | Fix script | Converts raw ADO HTML in Theme Description to plain text, re-pulling the full text from ADO. Dry → commit. New imports/backfills are handled automatically by the BR + `ADOSNTextUtil`. |
| 7 | **ADO-SN Sprint and Release Backfill** | Fix script | Dry (all) → `ONLY_PROJECT='OED - PRiSM'` → `ONLY_PROJECT=''`. Big run; safe to re-run if the browser times out. |
| 8 | `defect5_story_state_backfill.js` | Background script | **Dry run only** — should be ~0 with the new state map. If not, check step 1's warning. |
| 9 | **ADO-SN - Story Work Items Backfill (full, on demand)** | Scheduled job → **Execute Now** | Story Description, AC, Comments for ALL stories (no 5,000 cap; no browser timeout). Get OAuth Token first; watch System Logs for `[ADO-SN FULL BACKFILL]`. If errors climb after ~1 h, refresh the token and Execute Now again — it only picks up what's still missing. (`src/scheduled_jobs/ado_sn_story_work_items_backfill_full.js`) |

**Any time:** grant `scrum_product_owner` to the agile PMs (Betsy Kinney, Rakhee James,
Shon Kelly, Anu Urhekar, Thomas Macfarlan) or the ITS Project Managers group — Defects 14/15/17.

**Skip (colleague's Epic work):** ADO Epic Backfill, `epic_project_backfill.js`,
`epic_project_area_backfill.js`. Once Epic → Project is done, `defect2_theme_project_backfill.js`
can fill the remaining Theme → Project via parent epic.

**Do not run:** `defect2_theme_title_push_to_ado.js` (writes to ADO);
steps 1–2 of `defect4_theme_cleanup_and_parent_epic.js` (deletes themes / resets THME counter).

## 5. Validate

Re-run the **ADO-SN Defects** query checks — Defects 4, 5, 10, 13 against the data;
14/15/17 logged in as one of the PMs; 11 as a Scrum Master. Spot checks:

- A story: Theme, Epic, Project, ADO Number, State, Sprint, Release, Description, AC.
- An Epic (e.g. ENT, ADO 236558): **Themes** tab lists all its Features (72 in Dev).
- A Theme: **Epics** tab shows its one parent Epic; ADO Number, Project, Description.

## Expected gaps (by design)

- Stories/themes at an ADO project **root** area (e.g. `ITS - ServiceNow`, ~1,555 stories
  and 174 themes in Dev) have no Project — FY26 vs FY27 is a business decision.
- `ITPMO - New Area` (SPM Test-6) has no matching project.
- Stories with no parent Feature in ADO have no Theme/Epic.
