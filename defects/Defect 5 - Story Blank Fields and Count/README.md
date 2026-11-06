# Defect 5 — Stories: Theme/Epic/Points/Sprint/Release blank; ADO Number & Priority not on form; count mismatch

- **ADO work item:** 269818
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test) — 11/05/2026; **2nd retest (State mismatch) fixed 11/06** —
  state backfilled from ADO truth (7,106 corrected; STRY0022496 → Complete). Config follow-up
  for ~11 wrong-mapped templates noted below.

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

## Retest 2 (11/06/2026) — Story.State does not match ADO → FIXED (data)

Betsy's 2nd retest (`5b. Betsy - 2nd Retest…docx`) flagged **STRY0022496 ↔ ADO 265434**:
ADO = **Closed**, SN = **Draft**. *"The State is mapped incorrectly."*

**Root cause (two layers):**
1. **Custom ADO state model.** This ADO org's User Story type has **13 custom states**
   (New, Approved, Solutioning, Ready for Dev, Dev, Dev Complete, Ready for Testing,
   Testing, Bug Fix Req, Ready for UAT, Ready for Release, Closed, Removed) — **not** the
   default New/Active/Resolved/Closed/Removed. State translation is the import's
   **`sn_int_common_choice_map`**, keyed per process-template User Story **State** field map.
   The **main `Meck-Agile-Template-1.0.0`** template maps the custom states correctly
   (e.g. `Ready for UAT → Complete`; verified ADO **264677** "Ready for UAT" → **STRY0012673 =
   Complete**). So the field-map row `System.State → state` is fine; the **value translation**
   is what matters.
2. **Stale incremental sync.** `Closed → Complete` is mapped correctly, yet STRY0022496 sat
   at Draft — it was imported before it went Closed and the incremental sync never
   reprocessed it. Widespread: **~82%** of the 9,969 ADO-linked stories were Draft/blank.

**Fix (DATA) — `src/background_scripts/defect5_story_state_backfill.js`:** pulled each story's
live ADO `System.State` (ADO REST `workitemsbatch`, OAuth token from `ADOWorkItemBackfillUtil`)
and set `rm_story.state` via the canonical map, `setWorkflow(false)` (no outbound to ADO).
- **7,106 corrected** (6,796 → Complete, 230 → Cancelled, 46 → Draft, 25 → Ready, 8 → WIP,
  1 → Testing). 0 unmapped states. 1,169 not returned by ADO (removed/other project) left as-is.
- **0 mismatches remaining.** Verified STRY0022496 (ADO 265434 Closed) → **Complete**.

Canonical ADO User Story state → `rm_story.state`:

| ADO state | SN state | | ADO state | SN state |
|-----------|----------|---|-----------|----------|
| New | Draft (-6) | | Testing | Testing (-8) |
| Approved | Ready (1) | | Bug Fix Req | Work in progress (2) |
| Solutioning | Draft (-6) | | Ready for UAT | Complete (3) |
| Ready for Dev | Ready (1) | | Ready for Release | Complete (3) |
| Dev | Work in progress (2) | | Closed | Complete (3) |
| Dev Complete | Work in progress (2) | | Removed | Cancelled (4) |
| Ready for Testing | Ready for testing (-7) | | | |

### Going forward (config follow-up — NOT yet done)

The state **choice map is correct only on the main `Meck-Agile-Template-1.0.0` and
`ServiceNow-Template-1.0.0` templates.** **~11 other process templates** still have their
User Story State choice map wired to the **default** ADO states (Active/Resolved) this org
never uses — so any project on those templates will mis-map custom states to Draft on future
syncs: `Meck-Agile-Procurement`, `Meck-Agile-Infrastructure`, `Meck-Agile-Strategy-EA` (1.0 &
2.0), `Meck-Agile-LIB-CMS`, `Databases and BI Integrations`, `Agile map`,
`Meck-ITS-Construction`, `Meck-Agile-ITS-Kaizen`, `Meck Agile Template map`, … To make the
fix durable for those projects, copy the correct main-template choice rows onto each wrong
template's State field map (and drop the stale Active/Resolved rows). The backfill above is
template-independent (pulls ADO truth), so the data is correct now regardless.

## TODO
- Replicate the sprint/release/project backfills + the Team Integration Settings
  in Dev/other environments (data is not update-set tracked).
- Replicate the **state backfill** per environment; audit/fix the ~11 wrong-mapped
  process templates' User Story State choice maps (see "Going forward").
