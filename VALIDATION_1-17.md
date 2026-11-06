# UAT Validation — Defects 1–17 (retested as Betsy Kinney)

**Date:** 11/05/2026 · **Instance:** mecknctest · **Method:** impersonated **Betsy Kinney**
(IT Project Manager II; roles: scrum_master, scrum_admin, scrum_user; **not** admin) and
exercised each defect through the UI as the tester would, cross-checked against ADO.

> ⚠️ **Correction:** earlier notes marked 14/15 and 17 "resolved in place." That was based
> on testing **as admin**, where the forms work. Retesting **as a real scrum user (Betsy)**
> shows 14/15 and 17 **fail** — a permission gap that admin-override hid. Details below.

## Results

| # | Defect | Result (as Betsy) | Evidence |
|---|--------|-------------------|----------|
| 1 | Backlog count / area drift | ✅ Pass — CLZ backlog views (1,156 records); area reconciled (data) | backlog view |
| 2 | Epic ADO# & story linking | ✅ Pass — STRY0016692 shows Epic + ADO# 253143 | story form |
| 3 | Releases not listed | ✅ Pass — story shows Release (Release 3 FIN) | story form |
| 4 | Theme ADO# & hierarchy | ✅ Pass — story shows Theme (MeckAppsDev_Blank) | story form |
| 5 | Story blank fields + sprint + ADO#/Priority on form | ✅ Pass — Points, Project, Release, Theme, **Sprint 12**, ADO# all present | story form |
| 6 | Epics missing (DSS-CCS) | ✅ Pass — **9 epics** present for DSS CCS | epic list |
| 7 | Acceptance Criteria | ✅ Pass — AC populated on STRY0016692 | story form |
| 8 | New release in dropdown | ✅ Pass — releases present/selectable (Release populated) | story form |
| 9 | FY26 epics in Project Workspace | ✅ Pass — **24 epics** linked to Cloud Landing Zone | epic list |
| 10 | Themes missing (Finance) | ✅ Pass — not a bug; 1 ADO Feature = 1 theme (correct) | (data) |
| 11 | Scrum Master sees "Create Agile Group" | ✅ **Pass — fix confirmed**; Betsy gets **No Results** | nav search |
| 12 | Theme "no data" + New | ✅ Pass — source-empty fields; New = blank by design | theme form |
| 13 | Theme Description & Assigned To | ✅ Pass — THME0011073 shows Description + **Assigned to** | theme form |
| 14/15 | Personal backlog sharing / Submit | ✅ **Pass (fixed 11/06)** — Betsy created a personal backlog (editable form, Submit) | personal-backlog form |
| 16 | Create Story Submit | ✅ Pass — Create Story shows **Save + Submit** | create-story modal |
| 17 | Triage Board link | ✅ **Pass (fixed 11/06)** — Triage Board link appears on Betsy's owned backlog | backlog view |

**Score: 17 / 17 pass** (14/15 & 17 fixed 11/06 by granting PMs `scrum_product_owner`).

## Root cause of the two failures (same class)

`backlog_definition` (personal backlog) and `triage_definition` (triage board) are gated so
that **only admins can create them** in this instance:

- Every `backlog_definition` ACL (create/write/read/delete) is `roles: none` with
  `admin_overrides` on. The create path does **not** grant scrum users, so a non-admin sees
  the "Create a new backlog" form **read-only with no Save/Submit** (the ⋯ menu has no
  Insert either). `triage_definition` follows the same pattern, so the **"Triage Board"**
  link (which sets up a triage) doesn't appear for a non-admin even on a backlog they own.
- As **admin**, admin-override makes both work — which is why these looked fine until the
  retest as Betsy.

### Resolution (11/06) — grant PMs `scrum_product_owner`

The whole cluster (personal-backlog **create/write/delete**, triage **create/write**, AND the
Agile Board's client-side **Triage Board link**) is OOTB-gated on the **`scrum_product_owner`**
role. The Meck PM testers have scrum_master/scrum_admin/scrum_user but **not** scrum_product_owner.

Verified fix (as Betsy): with `scrum_product_owner`, the personal-backlog form is editable and
she **created a backlog**, and the **Triage Board link appears** on her owned backlog. (An
earlier attempt to broaden the ACLs to `scrum_user` fixed 14/15 but could **not** fix the
Triage Board link, which is a client-side role check in the deprecated Agile Board bundle — so
those ACL changes were reverted in favor of the role grant.)

**Applied (Test, 11/06):** granted `scrum_product_owner` to the agile project PMs — **Betsy
Kinney, Rakhee James, Shon Kelly, Anu Urhekar, Thomas Macfarlan** (Jeremy Pollard already had
it). **Pending: Quiana Williams** (username didn't match; grant via her user record). This is a
**DATA** change (role grant), not update-set tracked — replicate per environment. The earlier
ACL update set `MECK - AT - 270034 270036 - AGILE SELF SERVICE PERMS` was reverted and is now a
no-op.

> Note: `scrum_product_owner` also carries other scrum product-owner capabilities; granting it
> is the OOTB way to enable these features for PMs. If you want these features for *all* scrum
> users (broader self-service) instead, the alternative is broadening the backlog/triage ACLs —
> but the deprecated Agile Board's Triage Board link would still require `scrum_product_owner`.

## Notes
- 16 is working-as-designed (Submit = new record; Save then Update).
- 1/6/9 validated via epic/story lists visible to Betsy; the SPM Project Workspace Epics tab
  (UXF) was validated earlier by the team.
- Project-backlog owners were aligned to PMs earlier this session, so Betsy owns the CLZ
  backlog used for the 17 test.
