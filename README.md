# ADO → ServiceNow Backfill (ADO_SN)

Pulls **Description**, **Acceptance Criteria**, and **Comment history** from Azure
DevOps (ADO) work items into their corresponding ServiceNow records.

## Why this exists

The out-of-the-box ServiceNow **Agile Azure DevOps integration** syncs work items,
states, and hierarchy, but it does **not** import three things we needed:

- **Description** (`System.Description`)
- **Acceptance Criteria** (`Microsoft.VSTS.Common.AcceptanceCriteria`)
- **Comments / discussion history** (`System.History`)

This utility calls the ADO REST API directly and writes those values onto the
ServiceNow `rm_story` records. Comments land in **work notes**.

The repo has since grown to cover a set of **UAT defects** for the ADO↔SN
integration — each has its own folder under `defects/`.

## UAT defects

Each folder has a README with the defect, root cause, fix, and run commands.
The shared Script Includes live in `src/` (their methods serve several defects).

| # | Defect | Status |
|---|--------|--------|
| [1](defects/Defect%201%20-%20Backlog%20Count%20Mismatch/README.md) | Backlog count mismatch (area drift) | ✅ resolved (Test) |
| [2](defects/Defect%202%20-%20Epic%20ADO%20Number%20and%20Story%20Linking/README.md) | Epic ADO Number & story linking | ✅ resolved (Test) |
| [3](defects/Defect%203%20-%20Releases%20Not%20Listed/README.md) | Releases not listed | ✅ resolved & validated (Test) |
| [4](defects/Defect%204%20-%20Theme%20ADO%20Number%20and%20Hierarchy/README.md) | Theme ADO Number & hierarchy | ✅ resolved (Test, pending re-validation) |
| [5](defects/Defect%205%20-%20Story%20Blank%20Fields%20and%20Count/README.md) | Story blank fields & count | ⏳ partial (points/project/release/theme/form done; sprint deferred) |
| [6](defects/Defect%206%20-%20Epics%20Missing%20(DSS-CCS)/README.md) | Epics missing (DSS-CCS) | ⏳ open |
| [7](defects/Defect%207%20-%20Acceptance%20Criteria%20Required/README.md) | Acceptance Criteria required | ✅ resolved & validated (Test) |
| [8](defects/Defect%208%20-%20New%20Release%20Not%20in%20Dropdown/README.md) | New release not in dropdown | ✅ resolved & validated (Test) |
| [9](defects/Defect%209%20-%20FY26%20Epics%20Not%20in%20Project%20Workspace/README.md) | FY26 epics not in Project Workspace | ⏳ open |

Cross-cutting views: [`docs/uat-defects.md`](docs/uat-defects.md) (triage + field
maps + processing findings), [`docs/uat-plan.md`](docs/uat-plan.md) (timeline).

## Components

| Path | What it is |
|------|------------|
| `src/script_includes/ADOWorkItemBackfillUtil.js` | The Script Include that does all the work. |
| `src/background_scripts/run_backfill.js` | Ordered runner (paste into Scripts - Background). |
| `docs/notes.md` | Hard-won gotchas discovered while building this. |

## How to run

Run the three steps **in order** from Scripts - Background (global scope). Set your
current Update Set to the ADO update set first (not `Default [Global]`).

1. **Auth check** — `new ADOWorkItemBackfillUtil().testAuth();`
   Expect `HTTP 200` from `/_apis/projects`.
2. **Comments check** — `new ADOWorkItemBackfillUtil().testComments(<adoId>);`
   Use an ADO id you know has comments. Expect `fetched N comment(s)` with N > 0.
3. **Backfill** — `new ADOWorkItemBackfillUtil().backfillAll();`
   Processes up to `BATCH_LIMIT` (5000) candidates per run. With more than 5000
   candidates, run it again — processed records drop out of the candidate set, so
   the next pass picks up the remainder. Re-runs are safe (dedup + null guards).

## Configuration

All config lives in `initialize()` of the Script Include. Adjust per environment:

| Property | Purpose |
|----------|---------|
| `ADO_ORG_URL` | ADO org base URL (`https://dev.azure.com/meck-tfs`). |
| `API_VERSION` | Work-item API version (`7.1`). |
| `COMMENTS_API_VERSION` | Comments resource version — `5.0-preview.2` (versioned separately). |
| `OAUTH_ENTITY_NAME` | Name of the OAuth provider (`oauth_entity`) record. |
| `CONNECTION_ALIAS_ID` | Connection & Credential alias sys_id (fallback token source). |
| `TABLE` | Target table (`rm_story`). |
| `ADO_ID_FIELD` | Field holding the ADO work item id (`u_ado_number`). |
| `DESC_FIELD` / `AC_FIELD` | Description / Acceptance Criteria targets. |
| `WORKNOTES_FIELD` | Journal field comments write to (`work_notes`). |
| `BATCH_LIMIT` | Max records per run (5000). |

## Candidate scope

`backfillAll()` only selects records that have an ADO id **and** are missing
description or acceptance criteria. A record that already has both is skipped, so
its comment history is not re-pulled. To backfill comments on **every** synced
record, comment out the two `[SCOPE]` lines in `backfillAll()`.
