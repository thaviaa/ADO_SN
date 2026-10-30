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
