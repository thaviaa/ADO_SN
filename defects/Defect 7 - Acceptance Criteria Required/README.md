# Defect 7 — New Story can be saved without Acceptance Criteria

- **ADO work item:** 269819
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** 🔧 FIX SPEC READY
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
