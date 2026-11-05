# Defect 9 — Project Workspace Epics tab shows no FY26 Epics for ServiceNow FY26

- **ADO work item:** 269824
- **Tester:** Quiana Williams · opened 10/28/2026
- **Status:** ✅ RESOLVED (Test, pending Quiana re-validation) — 11/05/2026, update set `MECK - AT - 269824 - UAT DEFECT 9`
- **Expected:** Project Workspace → ServiceNow FY26 → Epics tab shows the ADO epics.
- **Actual:** No FY26 epics available (tab empty).

## Root cause (confirmed in Test)

"ServiceNow FY26" = the **pm_project `ITS ServiceNow Operational FY26`** (PRJ0010065).

The Project Workspace **Epics tab is driven by the project's stories.** Its defined
relationship (`sys_relationship` "Epics", for `pm_project`) is:

```
rm_epic WHERE sys_id IN ( distinct rm_story.epic
                          FOR rm_story WHERE project = <this project> AND epic != '' )
```

So the tab lists the epics of the project's stories. FY26 had **45 stories with
`project` set, but every one had `epic` empty** → the tab was empty. (`rm_epic` has
no direct `pm_project` field; the tab joins only through the stories' `epic`.)

Why the stories had no epic: the **Defect 2 BR links a story's epic via its synced
Feature/`scrum_theme`** (it starts from `current.theme`). But the FY26 area imported
the **Stories without importing their parent Features as themes** — of 19 parent
Features only **2** are synced as `scrum_theme`. So the story→epic rule never fired
for FY26. The **grandparent Epics themselves ARE imported** (all 7 are `rm_epic`
records), so the link is recoverable — it just had to be made directly, not through
the (missing) themes.

### FY26 area data (ado_area `ITS - ServiceNow\ITPMO – ITS ServiceNow Operational FY26`)
- 120 story links in the area: **45** on `project = FY26`, **48** with no project,
  **27** on other projects.
- 19 distinct parent Features (all exist in ADO); **only 2 synced as themes**.
- 7 distinct grandparent Epics; **all 7 synced as `rm_epic`**.

## Fix (Test) — direct epic linking

The real bug is in the reusable linker: `syncHierarchy` resolved a story's epic
**only through a synced Feature/theme** (`featureEpic` was built from synced
Features only). Generalized it to resolve the epic **directly from the ADO
grandparent** — independent of whether the Feature is synced as a theme.

- **`ADOReconciliationUtil.syncHierarchy`** (`src/script_includes/`): removed the
  synced-only `featureEpic` prebuild; now resolves each story-parent's own parent in
  ADO per batch and sets `rm_story.epic` from `epicByAdo[parent] || epicByAdo[grandparent]`.
  Also fixes Defect 6-family areas generally. Captured in the update set.
- **Backfill run (data, Test):** `syncHierarchy('<FY26 area>', {dryRun:false})` →
  120 stories, **epic set on 90**, theme on 14 (only 2 Features synced), 18 top-level
  stories have no ADO parent (nothing to link).
- **Result:** the FY26 Epics tab now lists **9 epics** (was 0): EPIC0010044, 0010048,
  0010063, 0010072, 0010075, 0010077, 0010080, 0010082, 0010085.
- **Going forward:** new BR **"Defect 9 - Set Story Epic direct (no synced theme)"**
  (`src/business_rules/defect9_set_story_epic_direct.js`) on `rm_story` — when a story
  has **no theme**, walk the ADO parent chain directly to the Epic and set
  `rm_story.epic`. Complements (doesn't overlap) the Defect 2 BR, which fires when
  theme is set. Captured in the update set.

## Promotion
- **Config (in `MECK - AT - 269824 - UAT DEFECT 9`):** the `syncHierarchy`
  enhancement + the new "Set Story Epic direct" BR.
- **Data (re-run per environment):** `new ADOReconciliationUtil().syncHierarchy('<FY26
  area display path>', {dryRun:false})` — not update-set tracked.

## Open items to flag (broader than the tab fix)
These don't block the tab, but limit how *complete* the FY26 view is:
1. **48 FY26-area stories have no `project`** (project resolver failures — Defect 5).
   Their epics won't show under FY26 until `project` is set. (All 7/7 distinct epics
   already appear via the 45 project-set stories, so the tab isn't missing epics
   today — but story coverage is partial.)
2. **17 of 19 FY26 Features aren't imported as `scrum_theme`** (themes). The Epics
   tab doesn't need themes, but the Theme/hierarchy views do — same import-routing
   gap as Defect 6.
3. **27 FY26-area stories are attributed to other projects** — left as-is (may be
   legitimate moves; changing them risks other projects' data).

## Notes
- Same family as Defect 6 (project/area routing/discovery), but Defect 9's blocker
  was specifically **story→epic linking via missing themes**, not a total import
  failure — the epics were present, just unlinked.
