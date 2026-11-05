# Defect 2 — Epics: ADO Number field missing from form; ADO stories not linked to Epic

- **ADO work item:** 269821
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test) — 11/05/2026, update set `MECK - AT - 269821 269823 - UAT DEFECT 2_4`

**Done:** story→epic linked area-wide (`rm_story.epic` = 5,497), `u_ado_number`
stamped on all 191 epics, ADO Number added to the `rm_epic` **Scrum** form view
(the Default view already had it), field map changed to `System.Parent → theme`,
and the epic business rule created. All config captured in the 2_4 update set
(Script Include, Business Rule, Field Map, Form Layout). ~712 stories have no
parent Feature in ADO and ~178 have a Feature not yet synced as a theme — those
link when the Feature syncs (field map + BR handle them going forward).
- **Expected:** The ADO Number field is on the Epic form and populated; stories
  related to the epic show on the epic page in SN.
- **Actual:** ADO Number not on the form / not populated; no ADO stories linked
  to the epic.

## Likely root cause

Two parts:
1. **Form layout** — `u_ado_number` isn't on the Epic (`rm_epic`) form.
2. **Story→Epic linking** — the Story table map uses `System.Parent → epic`, but
   a User Story's ADO **parent is usually a Feature, not an Epic**. So the link
   either resolves wrong or stays empty. Needs the hierarchy walked
   Story → Feature → Epic (or the parent mapped to the right level).

## Fix (build ready — `syncHierarchy` + `stampAdoNumbers`)

Confirmed in Test:
- Epics **are** synced as `rm_epic` (191 external-id rows); Features as
  `scrum_theme` (430). Only the **parent link** is missing in SN.
- Parent chain read live from ADO: Story `System.Parent` = Feature,
  Feature `System.Parent` = Epic (verified: 239467 → 238278 → 236403).

### Field map bug (confirmed from the rm_story Table Map, 11/04/2026)

The `rm_story` table map (`ServiceNow-Template-1.0`, Integration Type Agile) has
the row **`System.Parent → epic`**. A User Story's `System.Parent` is its
**Feature** (= Theme), not its Epic — so this row is wrong. It mostly fails to
resolve (a Feature can't fill an `rm_epic` reference), which is why so few stories
have an epic, and it will **re-apply on every sync and clobber the backfilled
`epic`**. Fix for ongoing sync (a field map is one hop; epic is two hops):
1. Change `System.Parent → epic` to **`System.Parent → theme`** (Feature→Theme).
2. Epic (the Feature's parent) needs a **business rule** on `rm_story`, not a field
   map — set `epic` from the Theme's parent Epic. (The one-time backfill below
   handles existing stories.)

**Change the field-map row before/right after running the backfill**, or the next
sync can undo the epic links.

The rest of the map is correct: `System.Id → u_ado_number`,
`Microsoft.VSTS.Common.Priority → priority`, `System.AreaPath → project`, etc.

### Backfill

`ADOReconciliationUtil.syncHierarchy(areaPath)` walks that chain and sets
`rm_story.theme` (Feature→`scrum_theme`) and `rm_story.epic` (Feature's
parent Epic→`rm_epic`). `stampAdoNumbers()` fills `u_ado_number` on the synced
themes/epics. See [`../../docs/iteration-sync-design.md`] sibling and the Script
Include. Remaining config: add `u_ado_number` to the `rm_epic` form (Defect 2)
and `scrum_theme` form (Defect 4) via Configure → Form Layout (update set
`MECK - AT - 269821 269823 - UAT DEFECT 2_4`).

## Notes
- Related to Defect 4 (Theme hierarchy) and Defect 5 (Parent→epic suspect map).
