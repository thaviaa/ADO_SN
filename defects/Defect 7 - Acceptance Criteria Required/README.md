# Defect 7 — New Story can be saved without Acceptance Criteria

- **ADO work item:** 269819
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** ✅ RESOLVED & VALIDATED (Test) — 11/04/2026 on the classic Story form; update set `MECK - AT - BUG 269819 - UAT Defect 7`
- **Expected:** Acceptance Criteria is required; SPM shouldn't save a story without it.
- **Actual:** SPM allows saving a story without acceptance criteria.

## Fix — onSubmit client script (+ UI Policy for the asterisk)

`acceptance_criteria` is an **HTML field** (`Type = HTML` in the dictionary), and
**ServiceNow does not enforce a mandatory on HTML fields at submit** — a mandatory
UI Policy or dictionary-mandatory shows the red asterisk but the save still goes
through. Confirmed in testing: even the unconditional mandatory UI Policy let a
blank-AC story save.

So enforcement is done with an **onSubmit client script** that aborts the save
when the HTML field is empty (after stripping tags/whitespace). The unconditional
UI Policy is kept only for the mandatory indicator.

Both are **form-only / client-side**, so the ADO integration (server-side
GlideRecord inserts) is never blocked — a dictionary-mandatory or a Data Policy
*would* block imports and must be avoided.

### The onSubmit client script (the actual enforcement)

`sys_script_client` on `rm_story`, type **onSubmit**, active, ui_type Desktop:

```javascript
function onSubmit() {
    var ac = g_form.getValue('acceptance_criteria');
    var stripped = (ac || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, '').replace(/\s/g, '');
    if (stripped === '') {
        g_form.addErrorMessage('Acceptance Criteria is required. Please enter it before saving.');
        g_form.showFieldMsg('acceptance_criteria', 'Acceptance Criteria is required.', 'error');
        return false;
    }
    return true;
}
```

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
| onSubmit client script — *Defect 7 - Require Acceptance Criteria (onSubmit)* **(enforces)** | `sys_script_client` | `dd9241a63354935020f072d24d5c7b58` |
| UI Policy — *Require Acceptance Criteria on the Story form* (asterisk only) | `sys_ui_policy` | `17eef4ae3314935020f072d24d5c7b52` |
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
   Acceptance Criteria blank → **Save blocked** with the error banner
   *"Acceptance Criteria is required"*. *Do a fresh form load first — ServiceNow
   caches client scripts.*
2. Let the integration import a story with no AC → **imports fine** (not blocked;
   server-side inserts never run client scripts).
3. Edit an existing AC-less synced story on the form → **prompted for AC**
   (enforcement is unconditional — accepted trade-off).

## Caveat — workspace / quick-create
The onSubmit client script (ui_type Desktop) covers the classic Story form —
Anu's test case ("Create new story"). The Agile Board "Create Story" quick-create
(Now Experience / UIB) runs client scripts differently and may not fire this one.
If AC enforcement is also needed on the board quick-create, add a UI Builder
client-side validation (or a scoped Data Policy) for that surface — but validate
it does **not** fire on integration inserts first (it would block imports).
