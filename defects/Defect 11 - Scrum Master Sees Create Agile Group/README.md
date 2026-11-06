# Defect 11 — Scrum Master can see "Create Agile Group"

- **ADO work item:** 270028
- **Tester:** Rakhee James · opened 11/04/2026
- **Status:** ✅ RESOLVED (Test) — 11/05/2026
- **Update set:** `MECK - AT - 270028 - AGILE GROUP ROLE`

## The defect

In Agile Development, a user with the **Scrum** role should **not** see
`All > Agile Development > Create Agile Group` (an admin setup action). The tester
could see it.

## Root cause

The module **Create Agile Group** (application *Agile Development*,
`sys_app_module` `f37957510b732200a6acc93563673a28`) was configured:

- `roles = admin` (intended admin-only), **but**
- `override_menu_roles = false`

With **override off**, a module **ignores its own roles** and inherits the
**application menu's** roles. The *Agile Development* app menu is open to
`admin, scrum_admin, scrum_user, feature_user`. Scrum Masters hold
`scrum_admin`/`scrum_user`, so they saw the module despite its `admin`-only roles.

(Confirmed: real Scrum Masters — Karl Williams, Sam Khan, Rakhee James, Valerie
Thomas — effectively hold `scrum_admin`+`scrum_user` but **not** `admin`.)

## Fix

Set **`override_menu_roles = true`** on the module so it honors its own
`roles = admin`. Only admins now see "Create Agile Group"; Scrum Masters don't.

- Before: `override_menu_roles = 0`, `roles = admin`
- After:  `override_menu_roles = 1`, `roles = admin`
- Captured in update set as `Module : Create Agile Group`.

The **other** "Create Agile Group" (app *Agile Azure DevOps Integration*,
`roles = sn_ado_int.user`) is **not** exposed — that whole app menu is gated by
`sn_ado_int.user`, which no user holds. No change needed there.

## Validation

Impersonate a non-admin Scrum Master (e.g. Karl Williams) → `All > Agile Development`
→ confirm **Create Agile Group** no longer appears. As an admin it still appears.

## Note (per environment)
Migrate update set `MECK - AT - 270028 - AGILE GROUP ROLE` to other environments.
