# Iteration → Sprint/Release sync (Defects 3, 5, 8)

Shared design for the three defects that all trace to one gap: ADO stores both
**Release** and **Sprint** inside the work item's **IterationPath**, and the OOTB
integration never translates that into ServiceNow's `sprint` / `release` fields.

## What the OOTB integration does (and doesn't)

- It mirrors the ADO iteration tree into **`sn_ado_int_iteration`** — raw nodes
  with `path`, `name`, `has_children`, `ado_project`. **311 rows.**
- Each story's iteration is captured on its external-id row
  (`sn_int_common_external_identifiers.ado_iteration` → `sn_ado_int_iteration`).
  In Landing Zone, **all 6,088 story rows have it populated.**
- It does **NOT**: create `rm_sprint` records, create/link `rm_release_scrum`,
  or set `rm_story.sprint` / `rm_story.release`. There is no field-map row for
  `System.IterationPath`, and **no external-id rows** exist for `rm_release_scrum`
  or `rm_sprint` (0 each).

Result: `rm_story.sprint` populated on 300/10,387, `release` on 3/10,387.

## Data model

| Thing | Table | Key fields |
|-------|-------|-----------|
| Story | `rm_story` | `sprint` → `rm_sprint`, `release` → `rm_release_scrum` |
| Sprint | `rm_sprint` | `short_description`, `release` → `rm_release_scrum`, `release_team` → `scrum_pp_team` |
| Release | `rm_release_scrum` | `short_description`, `default_team` → `scrum_pp_team`, `state` |
| ADO iteration | `sn_ado_int_iteration` | `path`, `name`, `has_children`, `ado_project` |
| Story↔ADO link | `sn_int_common_external_identifiers` | `reference_value` (story), `ado_iteration`, `ado_area` |

## ADO IterationPath structure (Landing Zone)

```
ITS - Landing Zone Remediation                 has_children=true   (project/root)
  └─ Release 1 HHS                              has_children=true   (RELEASE)
       ├─ Sprint 0                              has_children=false  (SPRINT, leaf)
       ├─ Sprint 1
       └─ ...
```

- `segs = path.split('\\')`
- `segs[0]` = project, `segs[1]` = **release leaf**, last seg (when `length >= 3`)
  = **sprint leaf**.
- `length == 2` → story sits directly on a release (no sprint).

## SN target records (Landing Zone)

- **Releases: already exist** — 7 `rm_release_scrum` rows, named
  `ITS Landing Zone Remediation - Release 1 HHS` … `- Release 7`, state Draft,
  no product/team set.
- **Sprints: do not exist** — 0 `rm_sprint` under any LZ release. Must be created.

### Release name matching (ADO leaf → SN record)

SN `short_description` is `<project normalized> - <release leaf>`; the ADO release
leaf is the **last `" - "` segment** of the SN name:

- `"ITS Landing Zone Remediation - Release 1 HHS".split(" - ").pop()` = `"Release 1 HHS"`
- ADO `path.split("\\")[1]` = `"Release 1 HHS"` → **match**

Index all `rm_release_scrum` by that last-segment key; disambiguate same-leaf
collisions across projects by checking the SN name also contains a normalized
project token.

## The fix — `ADOReconciliationUtil` method

`syncIterations(project, areaPath, opts)` where `opts = {dryRun, createReleases}`:

1. **Build release index** from `rm_release_scrum` (leaf → sys_id).
2. **Walk the area's iteration nodes** (`sn_ado_int_iteration`, scoped to the
   project path). For each node resolve `{releaseId, sprintId}`:
   - release leaf = `segs[1]` → look up (or, if `createReleases`, create a
     `rm_release_scrum`).
   - sprint leaf = last seg when depth ≥ 3 → find/create `rm_sprint`
     (`short_description` = sprint leaf, `release` = releaseId). Dedupe on
     (release, name).
3. **Link stories**: for each iteration node, find its story external-id rows
   (`reference_table=rm_story`, `ado_iteration=<node>`, area scope) → set
   `rm_story.release` = releaseId and `rm_story.sprint` = sprintId.
4. Return counts: `{releasesMatched, releasesCreated, sprintsCreated,
   storiesLinked, skipped}`.

Iteration-first (not story-first) so release/sprint resolution happens once per
iteration (~tens of nodes) instead of once per story (~6,088).

### Defect-by-defect

- **Defect 5** (Sprint/Release blank) → steps 2–3 populate both fields.
- **Defect 3** (no stories under a release) → same link (`rm_story.release`) makes
  the release's story list populate.
- **Defect 8** (new release not in dropdown) → `createReleases` makes the sync
  create the `rm_release_scrum` for a release that doesn't yet exist in SN, so it
  appears going forward. **Open item:** confirm the `release` field's reference
  qualifier on the Story form (product/state scoping) so created releases actually
  show in the dropdown for these stories.

## Results (Test, 11/04/2026)

Release side **shipped** (`opts = { createReleases:true }`, `linkSprints` left off):

- **4,916** Landing Zone stories linked to their release (`rm_story.release`),
  across **9 active releases**.
- Created the 2 ADO releases with no SN record: `Release 8`,
  `Release 5 ENT_Conv EA` (both `active=true` → now in the Story release dropdown).
- `release` dropdown qualifier confirmed: `active=true` (so active releases show).
- One duplicate `Release 8` (a large run outran the browser's 45s eval timeout and
  the server kept going) was removed; a single record remains. **Lesson: run the
  commit in capped chunks (≤~800 updates/call) — the browser tool times out at
  45s though the server transaction keeps running.**

Resolves **Defect 3**, **Defect 8**, and the Release half of **Defect 5**.

## Sprint — deferred (framework not configured)

Sprint is **not** a backfill here. `rm_sprint` hard-requires a valid Agile 2.0
iteration (`sn_apw_advanced_eap_iteration`) — the *"Check sprint fields correctly
filled in"* rule rejects name+release+dates+team without it. That APW iteration
model is a self-referential tree guarded by *"Prevent Overlapping EAP Iterations"*,
and the instance has **0 APW iterations, 0 scrum teams**, no cadence tables.

Populating Sprint therefore means **standing up the Agile 2.0 iteration hierarchy**
(program/release/sprint iterations + teams + cadence) — a configuration project
with business decisions, not a data sync. `syncIterations` keeps `linkSprints` off
by default for this reason; the sprint branch is retained for an instance where the
framework is configured. Raised as a separate item.
