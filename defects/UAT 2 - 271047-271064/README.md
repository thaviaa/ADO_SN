# UAT round 2 — bugs 271047, 271048, 271050, 271051, 271053, 271064 (11/18/2026)

Found in **mecknctest**; fixed in **meckncdev** in update set
**`MECK - AT - P59 ADO-SN UAT BUGS 2 (271047-271064)`** + child **`... - ADO APP`** (ADO app scope).

| Bug | Title | Root cause | Fix |
|---|---|---|---|
| 271047 | Theme created by / updated by wrong, comments not in work notes | The import runs as `system`; the CreatedBy/ChangedBy field maps never stick (platform stamps sys_created_by/sys_updated_by). Nothing imported Feature comments. | `ADOSNWorkItemSync` + async BR *ADO-SN - Sync audit fields and comments from ADO* (scrum_theme, rm_epic, rm_story) + fix script *ADO-SN Audit Fields and Comments Sync* |
| 271048 | Epic description not imported | 0 of 190 epics had html_description (import never filled it; `ADOEpicBackfillUtil` pointed at the deleted OAuth provider). | Same sync fills Epic `html_description` (when empty) + comments; `ADOEpicBackfillUtil` OAuth provider fixed |
| 271050 | Story AC not required after leaving Draft | OOTB UI policy *Make acceptance criteria mandatory* (order 100, reverse-if-false) only applies when `original_task` is a story, so it switched mandatory **off** for ADO/new stories and overrode the Defect 7 policy. | Defect 7 UI policy: condition *State not in Draft, Cancelled*, reverse-if-false, **order 200**; onSubmit client script skips Draft/Cancelled |
| 271064 | New ADO epic not imported | All ADO projects are **not registered** (no webhooks) in dev and test, and the polling job *Import Azure DevOps Work Items* was inactive (daily). | Job active, **periodic every 5 min** (its look-back is the run period). Registering webhooks per project is the real-time alternative. |
| 271051 / 271053 | TPM can't see / share backlogs | Not config: the backlogs she opened are owned by other people (only the owner can edit sharing); she owns none. Same as Defects 14/15. | Decision needed — see below |

Note: 271050 narrows Defect 7. AC is now required **only outside Draft/Cancelled** (per
STRY0010395 AC), not on every save.

## After committing in Test (data — not in the update set)
1. Get OAuth Token on the Azure DevOps OAuth credential.
2. Fix script **ADO-SN Audit Fields and Comments Sync** — dry run, then `DRY_RUN=false`, **Proceed in Background**.
3. **Import Work Items** once for *ITS - SPM Test-6* and *ITS - ServiceNow* to pull epics 271055 / 271061
   (created before the polling job was on; it only looks back 5 minutes).

## 271051 / 271053 options
- Create a personal backlog per ITPMO project **owned by that project's TPM** and shared with the project group, or
- Reassign the existing `PRJ: ...` backlogs to the TPM, or
- Test-script change: TPMs create their own backlog via *Agile Development > Personal Backlogs > New*.

## 271051 / 271053 — fix (update set `MECK - AT - BUG 271053 - TPM PROJECT BACKLOGS`)
Every ITPMO project already has a `PRJ: <project>` backlog, but most were **owned by someone
other than the project's PM** (e.g. *PRJ: Cloud Landing Zone Remediation* owned by Jon Hardeman,
PM = Betsy Kinney). Personal backlog ACLs: write = `scrum_product_owner` **and owner is me**;
read = owner / Visible to / Visible to Groups.

Fix script **BUG 271053 - TPM Project Backlogs** (`src/fix_scripts/bug271053_tpm_project_backlogs.js`):
owner → project PM (previous owner kept in *Visible to*), *Visible to Groups* += project group
(ADO import settings group, else the stories' most common group); creates the backlog if missing.
Data — run per environment (dry run, then `DRY_RUN=false`).
Dev dry run: 6 owners changed, 2 groups added, 0 created. Dev has import settings for ITS - ServiceNow
only, so 5 projects found no group there; Test has import settings for all 7.
