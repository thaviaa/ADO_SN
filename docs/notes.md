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
- **`sys_ui_policy_action.ui_policy` is read-only to the Table/REST API.** A REST
  insert or PATCH returns 200/201 but silently drops the value, leaving an
  orphaned action. Set it from the UI Policy form's related list (supplies the
  parent context) or via server-side GlideRecord (`a.ui_policy = id; a.update();`),
  which bypasses the dictionary read-only. (Defect 7.)
- **UI Policy condition on an off-form field silently misfires.** A condition that
  references a field **not on the form view** (e.g. `external_identifier` on the
  Scrum Story view) evaluates as *false* on the client; with Reverse-if-false on,
  a mandatory action then flips back to **not** mandatory and the policy appears
  to do nothing. Either add the field to the view, or drop the condition. (Defect 7.)
- **Mandatory is NOT enforced on HTML fields at submit.** A mandatory UI Policy or
  dictionary-mandatory on an HTML-type field (e.g. `acceptance_criteria` on
  `rm_story`) shows the red asterisk but **does not block save**. To actually
  require an HTML field on the form, use an **onSubmit client script** that strips
  tags/whitespace and `return false` when empty. Keep it client-side (onSubmit) so
  the server-side integration inserts are not affected. (Defect 7.)
- **Running a background script without the editor:** `POST /sys.scripts.do` with
  `script=<code>&sysparm_ck=<g_ck>&runscript=Run Script&quota_managed_transaction=on`
  executes server-side in the current session (so the active update set applies
  and GlideRecord runs ACL-free). Useful when the Next Experience shell hides the
  script editor behind shadow DOM.

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
