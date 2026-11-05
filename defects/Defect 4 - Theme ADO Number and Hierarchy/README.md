# Defect 4 — Themes: ADO Number not populated; epics/stories not linked to Theme

- **ADO work item:** 269823
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ⏳ MOSTLY DONE (Test) — 11/05/2026, update set `MECK - AT - 269821 269823 - UAT DEFECT 2_4`

**Done:** `u_ado_number` stamped on all 431 themes; `rm_story.theme` linked
area-wide (= 5,461); stories now appear under their Theme; Theme form already
shows ADO Number. **Open:** *epics shown under the Theme* — blocked by the
hierarchy inversion (ADO Epic is the PARENT of the Feature, but SN Theme is the
parent of the Epic), so an Epic doesn't nest under a Theme and one Epic maps to
many Themes. Needs a business decision on whether/how to represent it.
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
- ADO Feature → SN Theme (`scrum_theme`) ✓ (confirmed 11/04/2026)
- ADO Epic → SN Epic (`rm_epic`) ✓ (confirmed 11/04/2026) — the Feature's parent
  Epic sets the Story's `epic`; ties this to Defect 2.

**Full mapping is now settled — ready to build (Defects 2 + 4 as one pass).**

## Plan
- For each Story, walk the ADO parent chain: parent **Feature** → `scrum_theme`
  (Theme), that Feature's parent **Epic** → `rm_epic` (Epic).
- Create/match the `scrum_theme` records, populate `u_ado_number` on them from the
  external-id record, and set `rm_story.theme` (+ `rm_story.epic` for Defect 2).
- Build with Defect 2 (Epic linking) as one hierarchy pass.

## Notes
- Theme source is a **dependency**, not a dev task. Shares hierarchy work with
  Defect 2.
