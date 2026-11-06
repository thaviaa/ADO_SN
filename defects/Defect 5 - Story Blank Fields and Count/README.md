# Defect 5 — Stories: Theme/Epic/Points/Sprint/Release blank; ADO Number & Priority not on form; count mismatch

- **ADO work item:** 269818
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test) — 11/05/2026

## Breakdown

| Sub-issue | Status | Notes |
|-----------|--------|-------|
| Count mismatch (SN 4,797 vs ADO 6,077) | ✅ cleared | Not an import gap — filtered SN view + area drift (see Defect 1). Area reconciles exactly. |
| Points blank | ✅ not a bug | `StoryPoints → story_points` is correct; `storyPointsCompare` match=6023, lost=0. |
| **Project blank** | ✅ fixed (Test) | `AreaPath → project` only resolves the area leaf by name at sync time; backfilled 1,256 stories with `backfillProject`. |
| Theme blank | ✅ fixed (Test) | Field-map row `System.Parent → theme` present; populates (Defect 4). |
| **Release blank** | ✅ fixed (Test) | `syncIterations` parses the ADO iteration path and set `rm_story.release` on 4,916 LZ stories (Defect 3/8). |
| **Sprint blank** | ✅ fixed (Test) | Backfilled — 33 sprints + 4,912 stories linked (see "Sprint" below). Earlier "deferred" hypothesis was wrong. |
| ADO Number / Priority not on form | ✅ fixed (Test) | On the Story form; validated (only Sprint remained). |

## Project backfill (done in Test)

```javascript
new ADOReconciliationUtil().backfillProject(
    'ITS - Landing Zone Remediation',
    'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation',
    'PRJ0010017', false, false
);
```

## Story field map (Table Map: rm_story, "Meck-Agile-Template-1.0.0 map")

Existing rows ok: Title→short_description, State→state, Id→u_ado_number,
History→work_notes, Description→html_description, AssignedTo→assigned_to,
StoryPoints→story_points, Priority→priority, AcceptanceCriteria→acceptance_criteria.

**Suspect:** `System.Parent → epic` (parent is often a Feature — Defect 2),
`System.AreaPath → project` (resolves by area leaf, needed the backfill).

**Missing rows:** Theme, Sprint (`System.IterationPath`), Release.

## Sprint — RESOLVED (11/05/2026)

The earlier "needs the full Agile 2.0 / APW framework" theory was **wrong**. The
synced `rm_sprint` records are **thin shells** — `short_description` = the sprint
name, start/end dates, and an external-id row linking to the ADO iteration GUID.
They carry **no** `release`, `release_team`, or APW `iteration`, and the 73 working
sprints (FY26/PRiSM/BizTax) were created this way. So no cadence/APW stack is
required.

**How sprint actually works:** there is **no sprint field map**. `rm_sprint` is
created by **`ADOSprintUtil.handleSprint` during work-item import**, and the story's
Sprint is set then. That only runs for (re)processed work items — and the import is
incremental, so Landing Zone's already-imported stories were never reprocessed and
its sprints were never created (it had 7 releases but 0 sprints).

**Fix (Test) — `defect5_sprint_backfill_landingzone.js`:** mirror the OOTB shell for
Landing Zone directly from SN data —
- created **33 `rm_sprint`** (one per leaf iteration; `short_description` = sprint
  name, start/end dates pulled from ADO classification nodes, external-id → iteration
  GUID);
- linked **4,912 stories'** Sprint field from each story's own `ado_iteration`
  (already on its external-id row). The ~1,156 stories at Release-level iterations
  have no sprint (correct).
- Validated: STRY0022497 → **Sprint 23** (was blank).

**Going forward:** new/changed stories get sprints from the normal import
(`ADOSprintUtil.handleSprint`) now that the Team Integration Settings exist; this
backfill only covered the pre-existing Landing Zone stories.

**Team mapping:** ✅ 1:1 (8 ADO teams → SN), Team Integration Settings created
11/05/2026 (see Defect 6 for the Default-Area fix that unblocked them).

## TODO
- Replicate the sprint/release/project backfills + the Team Integration Settings
  in Dev/other environments (data is not update-set tracked).
