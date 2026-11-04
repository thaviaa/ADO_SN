# Defect 3 — Releases: no stories listed under a Release in SN

- **ADO work item:** 269817
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test) — 11/04/2026, update set `MECK - AT - 269817 269818 269820 - UAT DEFECT 3_5_8`
- **Expected:** Stories in a release are listed under that Release in SN.
- **Actual:** No stories listed under the release.

## Fix (done in Test)

Root cause confirmed: `rm_story.release` (→ `rm_release_scrum`) was never populated
from the ADO iteration path — only 3 of 10,387 stories had it. `syncIterations`
parses each story's `ado_iteration` (`Project\Release\Sprint`), matches the
release, and sets `rm_story.release`. **4,916 Landing Zone stories are now linked
across 9 active releases**, so each release's story list populates. See
[`../../docs/iteration-sync-design.md`](../../docs/iteration-sync-design.md) and
Defect 8 (release creation) / Defect 5 (field map).

## Likely root cause

`release` on `rm_story` is a **reference** field with **no mapping row** on the
Story table map. ADO has no native "Release" field — release lives in the
iteration path (e.g. `...\Release 2 ECO\Sprint 9`). So Release must come from the
**iteration sync**, not a raw field map.

## Plan
- Determine how the OOTB iteration sync creates releases (Team Integration
  Settings / `sn_ado_int_iteration`). The processor already resolves iteration →
  sprint; confirm the release layer.
- Map/populate `release`, then link stories.

## Notes
- Shares root with Defect 8 (new release not in dropdown) and Defect 5
  (Sprint/Release blank). Tackle 3/5/8 together as the iteration/release sync.
