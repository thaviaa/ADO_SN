# UAT Defects (10/23–10/28/2026)

Triage of the nine UAT defects. Grouped by root cause — several defects share one.
Status: `open` until the fix is committed / config steps handed off.

Legend for **Fix type**:
- `code` — deliverable committed to this repo (Script Include, business rule, policy, script)
- `config` — ServiceNow instance configuration (form layout, field map, choice map,
  project discovery) — documented here, applied in the instance

| # | ADO | Defect | Root cause (hypothesis) | Fix type | Status |
|---|-----|--------|-------------------------|----------|--------|
| 1 | 269816 | Backlog count of no-points stories mismatch (Cloud Landing Zone) | **Root cause = AREA DRIFT, not deletions or points.** SN no-points 65 = ADO live 57 + 8 stories that MOVED OUT of the area in ADO (now at `ITS - Landing Zone Remediation` root) but SN still tags them Cloud Landing Zone. Points map correctly; 0 deleted-in-ADO. The ADO service hooks are **area-filtered (DevOps-controlled)**, and `ADOConstants.EVENT_TYPES` DOES include `workitem.updated` — but an area-filtered hook never fires when an item leaves the area, so SN keeps the stale `ado_area`. Fix = SN-side reconciliation sweep (`resyncArea`), since the filter can't be changed from SN. | code (sweep) | fix built |
| 2 | 269821 | Epics: ADO Number field missing from form; ADO stories not linked to Epic | Form missing `u_ado_number`; `System.Parent` → Epic link not set | config + code | open |
| 3 | 269817 | Releases: no stories listed under a Release in SN | Release not mapped / stories not linked to release | config + code | open |
| 4 | 269823 | Themes: ADO Number not populated; epics/stories not linked to Theme | `u_ado_number` not set on theme; hierarchy linking missing | code | open |
| 5 | 269818 | Stories: Theme/Epic/Points/Sprint/Release blank; ADO Number & Priority not on form; count SN 4,797 vs ADO 6,077 | **Count is NOT an import gap** — Cloud Landing Zone reconciles 6066=6066. The 4,797 is a filtered SN view. Real issues: missing field maps (Theme/Epic/Points/Sprint/Release), Priority choice map, ADO Number/Priority not on form. | config + code | count cleared; field maps open |
| 6 | 269822 | Epics from ADO project "DSS – CCS Provider System" not in SPM | Project/area not discovered or not routed to a table map | config | open |
| 7 | 269819 | New Story can be saved without Acceptance Criteria | `acceptance_criteria` not mandatory | code (quick win) | open |
| 8 | 269820 | New ADO "Release 8" not in SN Release dropdown | ADO releases/iterations not synced into SN | code + config | open |
| 9 | 269824 | FY26 Epics not shown in Project Workspace Epics tab | Same family as #6 — epics for a project not imported | config | open |

## Workstreams

**A. Count mismatch / missing records — #1, #5, #6, #9**
Stories: SN 4,797 vs ADO 6,077 (~1,280 missing). Whole projects' epics missing
(DSS–CCS, FY26). Likely area-path/project discovery scope or decision-table routing
not covering those projects/areas. First deliverable: a **reconciliation script**
that lists ADO work items per project and diffs against SN to produce the exact
missing ids — turns "counts don't match" into a concrete gap list.

**B. Missing field maps — #5 (and #1 points)**
Theme, Epic, Story Points, Sprint, Release, Priority not populating. Add field-map
rows on the relevant table maps; Priority needs a **choice map** for the ADO→SN
value mapping. Config, documented here.

**C. Hierarchy + ADO Number linking — #2, #4, #5**
`System.Parent` relationships from ADO not setting SN parent/epic/theme references;
`u_ado_number` not populated on Epic/Theme. Deliver a business rule to populate
`u_ado_number` from the external-identifier record, and a linking routine for the
Theme→Epic→Story hierarchy.

**D. Release sync — #3, #8**
ADO releases not represented in SN (dropdown stale) and stories not linked to their
release. Deliver a sync routine that pulls ADO releases and upserts SN release
records, then links stories.

**E. Acceptance Criteria required — #7 (quick win)**
Make `acceptance_criteria` mandatory for manual creation without blocking
integration inserts. UI Policy (form) + optionally a Data Policy scoped to exclude
the integration user.

## Story field map (Table Map: rm_story, "Meck-Agile-Template-1.0.0 map")

Current 13 rows (External -> Internal):

| ADO external field | SN field | Note |
|--------------------|----------|------|
| System.Title | short_description | ok |
| System.State | state | ok (needs choice map if ADO states != SN choices) |
| System.Parent | epic | **suspect** - parent is often a Feature, not an Epic (Defect 2) |
| System.Id | u_ado_number | ok |
| System.History | work_notes | ok |
| System.Description | html_description | ok |
| System.CreatedBy | sys_created_by | platform-stamped; won't hold ADO value |
| System.ChangedBy | sys_updated_by | platform-stamped; won't hold ADO value |
| System.AssignedTo | assigned_to | ok |
| System.AreaPath | project | **suspect** - area path into project field (Defect 5 count skew) |
| Microsoft.VSTS.Scheduling.StoryPoints | story_points | **correct** - points map is fine |
| Microsoft.VSTS.Common.Priority | priority | ok |
| Microsoft.VSTS.Common.AcceptanceCriteria | acceptance_criteria | ok |

**Missing rows (cause Defect 5 blanks):**
- **Theme** - no mapping row
- **Sprint** - no `System.IterationPath -> sprint` row
- **Release** - no mapping row

**Project field (System.AreaPath -> project, ref pm_project):**
- Imported empty on stories synced before the pm_project existed; the mapping
  resolves the area LEAF by name, but the leaf (`ITPMO - Cloud Landing Zone
  Remediation`) doesn't match the project name (`Cloud Landing Zone
  Remediation`), so it fails.
- **Backfilled (Test):** `backfillProject(area, 'PRJ0010017', false, false)` set
  1,256 stories (of 6,095 in the area; 4,839 already set). Still TODO: run in
  Dev/other envs; fix the resolver so NEW imports populate project (strip the
  `ITPMO - ` prefix or map from a cleaner source).

Points mapping is CORRECT; the earlier "points wrong" was comparing two
different work items (ADO 239597 vs SN 239579 - transposed digits).

**Test env also confirmed correct:** storyPointsCompare over 6095 stories
returned match=5431, mismatch=0, lost=0, both-blank=68. The phantom=596 was
an artifact of ADO `workitemsbatch` defaulting to errorPolicy=fail (one
deleted id 404s the whole 200-batch); fixed with errorPolicy=omit plus an
`ado-deleted` bucket so deleted ADO items aren't miscounted as phantom.

## ADO deletions not reflected in SN (UAT follow-up)

When a work item is deleted in ADO it moves to the project Recycle Bin, but the
integration leaves the SN story in place — so deleted-in-ADO items become SN
orphans and inflate counts (observed: SN 68 vs ADO 65 = 3 orphans; e.g. ADO
251195 is in the Recycle Bin but still live in SN).

- **Cleanup (built + run in Test):** `handleDeleted(project, areaPath, 'report'|'delete', dryRun)`
  reads the ADO Recycle Bin and finds/removes SN stories whose ADO id is deleted.
  Test run on Cloud Landing Zone area: 2,378 in the project Recycle Bin, 7 were
  live orphans in SN (268457/251195/269244/269159/269160/269161/269162) -
  deleted with their link rows. Still TODO: Dev + other envs.
- **Real-time (in progress):** decision = DELETE the SN record on ADO delete.
  ADO tech is setting up the `workitem.deleted` service hook. SN side: route the
  event (decision table -> subflow) to call `deleteByAdoId(adoId)`, which removes
  the story and its link row. Helper is built; wiring pending the hook.

## Constraint

Fixes are developed in this repo. Instance-only configuration (form layouts, field
maps, choice maps, project discovery) is specified here with step-by-step detail and
applied in the ServiceNow instance.

## Processing-side findings (read from ADOWebhookEventProcessorUtil in Test)

Confirmed by reading the OOTB `sn_agile_ado_int.ADOWebhookEventProcessorUtil`:

- **Deletes are handled OOTB.** `processWorkItemDeleteEvent()` deletes the SN
  record and its external-id link row on a `workitem.deleted` event. So the
  real-time delete fix needs only the DevOps `workitem.deleted` hook + a decision
  row routing it to this handler — no custom code. `deleteByAdoId` is a backup;
  `handleDeleted` remains for the existing backlog.
- **`ado_area` IS updated on every processed update.** `_handleNormalizedObj`
  re-resolves `System.AreaPath` -> `sn_ado_int_area` and writes `ado_area` on the
  external-id record. So area drift is a delivery gap (area-filtered hook never
  sends move-out events), not a processing bug. `resyncArea` is the compensating
  SN-side control.
- Processor also re-resolves iteration/sprint and honors allowed-states
  (`_checkImportCriteria`) and a cyclic-change guard (`checkIfPayloadIsCyclic`).
