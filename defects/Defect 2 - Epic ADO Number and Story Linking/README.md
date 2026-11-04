# Defect 2 — Epics: ADO Number field missing from form; ADO stories not linked to Epic

- **ADO work item:** 269821
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ⏳ OPEN
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

`ADOReconciliationUtil.syncHierarchy(areaPath)` walks that chain and sets
`rm_story.theme` (Feature→`scrum_theme`) and `rm_story.epic` (Feature's
parent Epic→`rm_epic`). `stampAdoNumbers()` fills `u_ado_number` on the synced
themes/epics. See [`../../docs/iteration-sync-design.md`] sibling and the Script
Include. Remaining config: add `u_ado_number` to the `rm_epic` form (Defect 2)
and `scrum_theme` form (Defect 4) via Configure → Form Layout (update set
`MECK - AT - 269821 269823 - UAT DEFECT 2_4`).

## Notes
- Related to Defect 4 (Theme hierarchy) and Defect 5 (Parent→epic suspect map).
