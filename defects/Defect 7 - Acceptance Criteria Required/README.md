# Defect 7 — New Story can be saved without Acceptance Criteria

- **ADO work item:** 269819
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** ✅ IMPLEMENTED (Test) — 11/04/2026, update set `MECK - AT - BUG 269819 - UAT Defect 7`
- **Expected:** Acceptance Criteria is required; SPM shouldn't save a story without it.
- **Actual:** SPM allows saving a story without acceptance criteria.

## Fix — UI Policy (form-only, integration-safe)

Make `acceptance_criteria` mandatory on the **Story form** with **no condition**.

Why a **UI Policy** (not a dictionary-mandatory or a plain Data Policy):
- UI Policies run **client-side on the form only**. The ADO integration inserts
  stories **server-side** (GlideRecord), which bypasses UI Policies entirely — so
  the integration is never blocked, even with an unconditional mandatory.
- A dictionary-mandatory or an unscoped Data Policy **would** block integration
  inserts (ADO stories legitimately may have no AC at import). Avoid those.

### Why unconditional (not scoped to manual stories)

The first cut scoped the policy with **`External identifier` is empty** (synced
stories have it populated, manual stories don't). In testing this **did not
enforce** — a new manual story (STRY0022565) saved with AC blank. Root cause:
`external_identifier` is **not on the Scrum Story form view**, and a UI Policy
condition on an off-form reference field evaluates as *false*, so (with
reverse-if-false) AC flipped back to **not** mandatory.

Dropping the condition fixes enforcement and is still integration-safe — the
integration never runs the policy at all. The only trade-off: a user editing an
AC-less *synced* story on the form is also prompted for AC. Accepted.

### The UI Policy

**UI Policy** (`sys_ui_policy`) — on the `rm_story` form:
- **Table:** `Story [rm_story]`
- **Short description:** `Require Acceptance Criteria on the Story form`
- **Active:** true
- **Application:** Global
- **Conditions:** *(none — unconditional)*
- **On load:** true
- **Reverse if false:** false
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
| UI Policy — *Require Acceptance Criteria on the Story form* | `sys_ui_policy` | `17eef4ae3314935020f072d24d5c7b52` |
| UI Policy Action — `acceptance_criteria` → Mandatory | `sys_ui_policy_action` | `97ee7cae3314935020f072d24d5c7b2a` |

Verified field values: policy `active/on_load/global = true`,
`reverse_if_false = false`, `conditions = ` *(empty)*, `table = rm_story`;
action `mandatory = true`, `visible/disabled = ignore`, linked to the policy.

> First deployed with condition `external_identifierISEMPTY`; removed after it
> failed to enforce (off-form condition field — see "Why unconditional" above).

> **Gotcha (for whoever promotes this):** `sys_ui_policy_action.ui_policy` is
> **read-only to the Table/REST API** — a REST insert/PATCH returns success but
> silently drops the value, orphaning the action. It must be set by the form's
> related-list (which supplies the parent context) or by a **server-side
> GlideRecord** (`a.ui_policy = <policyId>; a.update();`), which bypasses the
> dictionary read-only. This is why the action is created, then linked in a
> second server-side step.

### Test
1. Create a new Story in SPM (classic form — the surface Anu used), leave
   Acceptance Criteria blank → **Save blocked** with the mandatory indicator.
   *Do a fresh form load — ServiceNow caches UI Policies client-side.*
2. Let the integration import a story with no AC → **imports fine** (not blocked;
   server-side inserts never run the policy).
3. Edit an existing AC-less synced story → **prompted for AC** (unconditional —
   accepted trade-off).

## Caveat — workspace / quick-create
Classic UI Policies apply to the standard form. Anu's test case ("Create new
story") was on the classic Story form, which this covers. The Agile Board
"Create Story" quick-create (Now Experience / UIB) may not honor a classic UI
Policy. If AC enforcement is also needed on the board quick-create, the fallback
is a **Data Policy** with "Use as UI Policy" = true — but validate it does **not**
fire on integration inserts first (it would block them). Prefer the UI Policy
unless workspace enforcement is required.
