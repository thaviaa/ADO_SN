# Implementation notes & gotchas

Hard-won details from building and debugging this integration. Read before
touching the fetch or write logic.

## ADO payload / tokens

- **Comments are not a field.** They live on a separate resource:
  `GET /_apis/wit/workItems/{id}/comments`. A table/field map will never catch
  them. The endpoint is **preview-versioned separately** from the work-item API.
- **Comments paging quirk.** On this org, `5.0-preview.2` returns
  `totalCount: N` but `count: 0` unless you pass **`fromRevision=1`**. The fetch
  uses `?api-version=5.0-preview.2&fromRevision=1&$top=200`. If it 404s with
  "controller ... not found", the api-version is wrong for the route; if it 400s
  with "outside the valid version range", step the preview number.
- **The array key varies** between preview versions — parse
  `parsed.comments || parsed.value`.
- **The work item id is not in `fields`.** It is a top-level property
  (`resource.workItemId` / `id`), so you cannot field-map `System.Id`. The ADO
  number is stored on `u_ado_number` (populated from the external-identifier
  record) and read from there.
- **Update webhooks only carry the delta.** `resource.fields` holds only changed
  fields; the complete values live under `resource.revision.fields`.
- **AssignedTo / CreatedBy** arrive as formatted strings (`DisplayName <email>`).
- `sys_created_by` / `sys_updated_by` are platform-stamped and cannot hold ADO
  values — use custom `u_` fields if you need those.

## ServiceNow write behavior

- **Journal fields don't save via `setValue()`.** `gr.setValue('work_notes', x)`
  does **not** register a journal entry. Use direct assignment:
  `gr['work_notes'] = x;`. (This caused a long "it says updated but nothing
  showed up" chase — the fix is direct assignment.)
- **"Valid = true" on a field map** only confirms the ServiceNow target resolves;
  it does not confirm ADO emits that token or that the source had a value.
- Form **label names** (e.g. "Name", "Short description") do not reliably match
  backend field names — verify via Configure Dictionary.
- The activity-stream formatter on the form can **filter/cap** which work notes
  show; the journal (`sys_journal_field`) is the source of truth.

## The ADO<->SN link table (authoritative key)

The integration stores the ADO<->SN mapping in **`sn_int_common_external_identifiers`**
(plural), one row per synced record. Key fields:

- `external_id` — the ADO work item number (e.g. 265129)
- `reference_table` / `reference_value` — the SN table + record sys_id
- `ado_area` — reference whose display is the full ADO **area path**
  (`ITS - Landing Zone Remediation\ITPMO - Cloud Landing Zone Remediation`)
- `ado_iteration`, `external_project` — ADO iteration / project (display = name)
- `integration_type` — e.g. `Agile`

This table is the reliable SN-side key for reconciliation — it does **not** depend
on `u_ado_number` being populated on the record (which UAT showed is unreliable),
and it lets you scope the SN side by `ado_area` / `external_project` to match an
ADO WIQL scope exactly. The `external_identifier` reference field on `rm_story`
points here and its display value is the ADO number.

## Auth

- Token retrieval has two strategies: (1) `GlideOAuthClient` refresh-token grant,
  (2) fallback to the stored token on the connection alias. If strategy 1 logs
  `failed to find the oauth entity` / `AADSTS900144: must contain refresh_token`,
  that is cosmetic as long as strategy 2 then logs
  `Token obtained from connection alias` and the call returns HTTP 200.

## Operational

- `backfillAll()` is a Script Include method — saving the Script Include does not
  run anything. You must call it from a background script.
- `BATCH_LIMIT = 5000` caps a single run; with more candidates, run again.
- One (or two, with comments) REST calls per record — mind ADO rate limits on
  large runs. Consider scoping by Area/project for very large backfills.
