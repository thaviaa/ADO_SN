# Defect 8 — New ADO release (Release 8) not available in SN Story Release dropdown

- **ADO work item:** 269820
- **Tester:** Betsy Kinney · opened 10/27/2026
- **Status:** ✅ RESOLVED (Test) — 11/04/2026, update set `MECK - AT - 269817 269818 269820 - UAT DEFECT 3_5_8`
- **Expected:** A newly created ADO release appears in the SN Story "Release" dropdown.
- **Actual:** "Release 8" isn't available.

## Root cause (confirmed)

Releases are **not** created from ADO iterations. ADO keeps Release inside the
iteration path (`Project\Release\Sprint`); the OOTB integration mirrors iteration
**nodes** into `sn_ado_int_iteration` but never creates `rm_release_scrum`. So a
new ADO release (e.g. `Release 8`) has no SN record and can't appear in the
Story `release` dropdown.

The dropdown itself is fine: `rm_story.release`'s reference qualifier is simply
`active=true`, so any **active** `rm_release_scrum` shows. The gap was purely the
missing record.

## Fix

`ADOReconciliationUtil.syncIterations(..., { createReleases:true })` creates the
missing `rm_release_scrum` (with `active=true`) from the ADO release leaf and
links stories — see [`../../docs/iteration-sync-design.md`](../../docs/iteration-sync-design.md).

## Done in Test (11/04/2026)
- Created the 2 ADO releases that had no SN record: **`Release 8`** and
  **`Release 5 ENT_Conv EA`** (both `active=true` → now in the dropdown).
- One duplicate `Release 8` (created when a large run outran the browser timeout)
  was removed; a single `Release 8` remains.

## Notes
- Shared root with Defect 3 (stories under release) and Defect 5 (Release blank).
- Ongoing auto-creation for *future* new ADO releases would need the sync run on a
  schedule, or the OOTB release discovery configured — not just this one-time pass.
