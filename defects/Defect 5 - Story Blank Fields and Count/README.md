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
| **Release blank** | ✅ fixed (Test) | `syncIterations` parses the ADO iteration path and set `rm_story.release` on 4,916 LZ stories (Defect 3/8). |
| **Sprint blank** | ⛔ deferred | Needs the **Agile 2.0 iteration framework** stood up first — see below. Not a backfill. |
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

## Sprint — deferred (framework not set up)

Sprint is **not** a backfill in this instance. `rm_story.sprint` → `rm_sprint`,
and `rm_sprint` hard-requires a valid Agile 2.0 iteration
(`sn_apw_advanced_eap_iteration`), enforced by the *"Check sprint fields correctly
filled in"* business rule (name + release + dates + team are all insufficient
without it). That APW iteration model is a self-referential tree guarded by
*"Prevent Overlapping EAP Iterations"*, and it is **empty/unconfigured here**:
**0 APW iterations, 0 scrum teams**, no cadence tables.

So populating Sprint means **standing up the Agile 2.0 stack** —
teams → cadence → APW iterations → `rm_sprint` — within the overlap rules. Not a
data sync. ADO already carries the source data: 8 teams (`sn_ado_int_team`), the
iteration tree with real sprint start/finish dates, and 311 mirrored iteration
nodes (`sn_ado_int_iteration`).

**Preferred path:** don't script the stack by hand. The OOTB integration already
mirrors the ADO iterations; the sprint sync almost certainly stalls because
**Team Integration Settings** aren't configured (ADO teams not mapped to SN Agile
teams). Configure that first and let the integration generate iterations/sprints.
*Confirm the exact OOTB behavior in Team Integration Settings before building.*

**Business decisions:**
- Team mapping — ✅ **1:1** (each of the 8 ADO teams → one SN Agile team), confirmed 11/04/2026.
- Cadence — ⏳ open: mirror ADO's exact (possibly irregular) sprint dates, or impose
  a regular cadence? Drives the overlap-rule handling.

Raised as a separate item (needs the cadence decision + the Team Integration
Settings dig).

## TODO
- **Sprint:** separate Agile 2.0 framework setup (above) — business decision.
- Theme (Defect 4) — field-map row + hierarchy source.
- Add `u_ado_number` and the Priority field to the Story form.
- Replicate the release linking + project backfill in Dev.
