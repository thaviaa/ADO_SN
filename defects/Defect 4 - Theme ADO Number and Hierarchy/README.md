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
2. **Hierarchy linking** — Theme sits above Epic. ADO has no native Theme.

## Business decision (received 11/04/2026)

**ADO Feature → SN Theme** (`scrum_theme`). What ADO calls a *Feature*, SN calls a
*Theme*. So a Story's Theme comes from the **Feature** it rolls up to in ADO.

Note the level offset between the tools:

```
ADO:   Epic  →  Feature  →  User Story
SN:    Theme →  Epic     →  Story
```

- ADO User Story → SN Story ✓
- ADO Feature → SN Theme ✓ (confirmed)
- ADO Epic → SN Epic — **pending confirm** (if yes, the Feature's parent Epic sets
  the Story's `epic`; ties this to Defect 2).

## Plan (once the Epic mapping is confirmed)
- For each Story, walk the ADO parent chain: parent **Feature** → `scrum_theme`
  (Theme), that Feature's parent **Epic** → `rm_epic` (Epic).
- Create/match the `scrum_theme` records, populate `u_ado_number` on them from the
  external-id record, and set `rm_story.theme` (+ `rm_story.epic` for Defect 2).
- Build with Defect 2 (Epic linking) as one hierarchy pass.

## Notes
- Theme source is a **dependency**, not a dev task. Shares hierarchy work with
  Defect 2.
