# Defect 5 — Stories: Theme/Epic/Points/Sprint/Release blank; ADO Number & Priority not on form; count mismatch

- **ADO work item:** 269818
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ⏳ PARTIALLY DONE

## Breakdown

| Sub-issue | Status | Notes |
|-----------|--------|-------|
| Count mismatch (SN 4,797 vs ADO 6,077) | ✅ cleared | Not an import gap — filtered SN view + area drift (see Defect 1). Area reconciles exactly. |
| Points blank | ✅ not a bug | `StoryPoints → story_points` is correct; `storyPointsCompare` match=6023, lost=0. |
| **Project blank** | ✅ fixed (Test) | `AreaPath → project` only resolves the area leaf by name at sync time; backfilled 1,256 stories with `backfillProject`. |
| Theme blank | ⏳ open | No field-map row. |
| Sprint blank | ⏳ open | No `System.IterationPath → sprint` row; needs iteration sync. |
| Release blank | ⏳ open | No mapping; needs iteration/release sync (Defect 3/8). |
| ADO Number / Priority not on form | ⏳ open | Form layout. |

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

## TODO
- Add field-map rows / sync for Theme, Sprint, Release (references — need the
  iteration sync, not just rows).
- Add `u_ado_number` and the Priority field to the Story form.
- Replicate the project backfill in Dev.
