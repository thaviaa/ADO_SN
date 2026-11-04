# Defect 7 — New Story can be saved without Acceptance Criteria

- **ADO work item:** 269819
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** ✅ IMPLEMENTED (Test) — 11/04/2026, update set `MECK - AT - BUG 269819 - UAT Defect 7`
- **Expected:** Acceptance Criteria is required; SPM shouldn't save a story without it.
- **Actual:** SPM allows saving a story without acceptance criteria.

## Fix — UI Policy (form-only, integration-safe)

Make `acceptance_criteria` mandatory on the **Story form**, scoped to
**manually-created** stories so it never blocks the integration.

Why a **UI Policy** (not a dictionary-mandatory or a plain Data Policy):
- UI Policies run **client-side on the form only**. The ADO integration inserts
  stories **server-side** (GlideRecord), which bypasses UI Policies entirely — so
  the integration is never blocked, regardless of field timing.
- A dictionary-mandatory or an unscoped Data Policy **would** block integration
  inserts (ADO stories legitimately may have no AC at import). Avoid those.

### Scope it to manual stories

Condition: **`External identifier` is empty.** Integration-synced stories have
`external_identifier` populated (the link to `sn_int_common_external_identifiers`);
manually-created stories don't. So the mandatory only applies to manual stories,
and users editing an AC-less ADO story aren't forced to add AC.

### Create the UI Policy

**UI Policy** (`sys_ui_policy`) — on the `rm_story` form: Configure → UI Policies → New:
- **Table:** `Story [rm_story]`
- **Short description:** `Require Acceptance Criteria on manually-created Stories`
- **Active:** true
- **Application:** Global (or your ADO update set's scope)
- **Conditions:** `External identifier` — `is empty`
- **On load:** true
- **Reverse if false:** true
- **Global (all views):** true

**UI Policy Action** (`sys_ui_policy_action`) — in the UI Policy's related list → New:
- **Field name:** `Acceptance criteria [acceptance_criteria]`
- **Mandatory:** `True`
- **Visible:** `Leave alone`
- **Read only:** `Leave alone`

## Implemented in Test (11/04/2026)

Created in update set `MECK - AT - BUG 269819 - UAT Defect 7`:

| Record | Table | sys_id |
|--------|-------|--------|
| UI Policy — *Require Acceptance Criteria on manually-created Stories* | `sys_ui_policy` | `17eef4ae3314935020f072d24d5c7b52` |
| UI Policy Action — `acceptance_criteria` → Mandatory | `sys_ui_policy_action` | `97ee7cae3314935020f072d24d5c7b2a` |

Verified field values: policy `active/on_load/reverse_if_false/global = true`,
`conditions = external_identifierISEMPTY`, `table = rm_story`; action
`mandatory = true`, `visible/disabled = ignore`, linked to the policy.

Field chosen for the condition (`external_identifier`) confirmed against live
data: 9,956 of 10,385 stories have it populated (synced), 429 empty (manual) —
a clean integration-vs-manual split.

> **Gotcha (for whoever promotes this):** `sys_ui_policy_action.ui_policy` is
> **read-only to the Table/REST API** — a REST insert/PATCH returns success but
> silently drops the value, orphaning the action. It must be set by the form's
> related-list (which supplies the parent context) or by a **server-side
> GlideRecord** (`a.ui_policy = <policyId>; a.update();`), which bypasses the
> dictionary read-only. This is why the action is created, then linked in a
> second server-side step.

### Test
1. Create a new Story in SPM, leave Acceptance Criteria blank → **Save should be
   blocked** with the mandatory indicator.
2. Let the integration import a story with no AC → **imports fine** (not blocked).
3. Edit an existing ADO story that has no AC → **not forced** to add AC (condition
   excludes it).

## Caveat — workspace / quick-create
Classic UI Policies apply to the standard form. The Agile Board "Create Story"
quick-create (Now Experience / UIB) may not honor a classic UI Policy. **Test the
exact surface the tester used.** If that path isn't covered, the next-safest step
is a **Data Policy** with the *same* `external_identifier is empty` condition and
"Use as UI Policy" = true — but validate it does **not** fire on integration
inserts first (external_identifier may not be set at the instant of the integration
insert, which would block it). Prefer the UI Policy unless workspace enforcement
is required.
