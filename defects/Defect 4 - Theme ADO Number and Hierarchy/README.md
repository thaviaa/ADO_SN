# Defect 4 — Themes: ADO Number not populated; epics/stories not linked to Theme

- **ADO work item:** 269823
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ⏳ OPEN
- **Expected:** Theme ADO number populated; related epics and stories shown on
  the theme page.
- **Actual:** No ADO number; no epics/stories linked to the theme.

## Likely root cause

1. **ADO Number** not populated on `scrum_theme` — same pattern as Epic/Story
   (field not on form / not set from the external-id record).
2. **Hierarchy linking** — Theme sits above Epic. ADO has no native Theme, so
   Theme→Epic→Story linking needs a defined source. **Business must decide where
   Theme comes from** (parent of the Epic, a tag, or out of scope) before build.

## Plan
- Populate `u_ado_number` on `scrum_theme` from its external-id record.
- Pin down the Theme source (business decision), then build Theme↔Epic↔Story links.

## Notes
- Theme source is a **dependency**, not a dev task. Shares hierarchy work with
  Defect 2.
