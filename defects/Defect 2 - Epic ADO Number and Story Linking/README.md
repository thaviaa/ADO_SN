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

## Plan
- Add `u_ado_number` to the `rm_epic` form (and a business rule to populate it
  from the external-id record, like the Story project backfill pattern).
- Review the Story/Feature table maps; confirm whether Features are imported and
  how `System.Parent` resolves. Build the Story→Feature→Epic linking.

## Notes
- Related to Defect 4 (Theme hierarchy) and Defect 5 (Parent→epic suspect map).
