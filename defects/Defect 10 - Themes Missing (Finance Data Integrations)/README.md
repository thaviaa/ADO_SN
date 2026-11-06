# Defect 10 — "No themes set up for Finance Data Integrations"

- **ADO work item:** 270027
- **Tester:** Shon Kelly · opened 11/02/2026
- **Status:** ✅ RESOLVED — not an import gap; data is correct & complete (Test)

## The defect

Test Case 1.0 "Validate Synced Project", step 1.3a Navigate to Themes. Expected:
"Themes listed are correct for the respective Project." Actual: PRiSM passed (13
themes); **Finance Data Integrations showed no themes at all**, though the project is
in Test.

## Root cause — NOT an import gap

Themes are sourced from ADO **Features** (not Epics). The imported theme count equals
the ADO Feature count per project, **1:1 and complete**:

| ADO Project (→ Workspace) | ADO Epics → `rm_epic` | ADO Features → `scrum_theme` | ADO Stories |
|---|---|---|---|
| FIN - Advantage Finance (→ *Finance Data Integrations*) | 53 → 53 | **1 → 1** | 380 |
| OED - PRiSM (→ *PRiSM Data Augmentation App*) | 5 → 5 | **13 → 13** | 59 |

Finance Data Integrations has **exactly one** ADO Feature — `263068` (type *Feature*,
area `FIN - Advantage Finance\…\ITPMO - Finance Data Integrations`) — imported as
**THME0011016** (created 10/12/2026, before the test). So "1 theme" is the **correct**
number; the "13 like PRiSM" expectation is a false comparison — the two ADO projects
simply have different Feature counts. **No backfill is possible or needed.**

## Why the tester saw *zero* on 11/02

`scrum_theme` has no project field; the Agile 2.0 Project Workspace scopes Themes to a
project through the epic chain (theme → `u_parent_epic` → epic `u_project`). THME0011016's
parent epic is **EPIC0010135**, whose `u_project` was **blank on 11/02** — it was only
populated by the **[Defect 2b](../Defect%202b%20-%20Epic%20Project%20Mapping/README.md)**
epic→project backfill (run 11/05–11/06). With the epic unlinked, the one Finance theme
didn't resolve into the project view → the workspace showed 0.

With Defect 2b applied, EPIC0010135 → `u_project` = *Finance Data Integrations*, so the
theme now resolves into the project. **Defect 10 is a downstream consequence of Defect 2b,
now cleared.**

> The Project Workspace Themes list is a scripted Agile 2.0 (UXF) data source — there is
> **no** `sys_relationship` backing it (verified), so it can't be traced from the backend.
> Spot-check in the UI (below) is the ground-truth confirmation.

## Validation

- `src/background_scripts/defect10_theme_scope_diagnostic.js` — reproduces the
  ADO-vs-SN count comparison (read-only).
- **Spot-check for the tester:** open the **Finance Data Integrations** Project Workspace
  → Themes. Confirm **THME0011016** now appears (1 theme). Count parity with PRiSM is not
  expected — Finance has 1 Feature in ADO, PRiSM has 13.

## Note
If the Finance team wants more themes in the workspace, they must create more **Features**
in the ADO project (Epics and Stories do not become themes).
