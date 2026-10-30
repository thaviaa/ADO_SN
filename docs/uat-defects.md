# UAT Defects (10/23–10/28/2026)

Triage of the nine UAT defects. Grouped by root cause — several defects share one.
Status: `open` until the fix is committed / config steps handed off.

Legend for **Fix type**:
- `code` — deliverable committed to this repo (Script Include, business rule, policy, script)
- `config` — ServiceNow instance configuration (form layout, field map, choice map,
  project discovery) — documented here, applied in the instance

| # | ADO | Defect | Root cause (hypothesis) | Fix type | Status |
|---|-----|--------|-------------------------|----------|--------|
| 1 | 269816 | Backlog count of no-points stories: SN 63 vs ADO 83 (Cloud Landing Zone; 20 short) | Subset of count mismatch (#5): the ~20 stories are absent from SN. SN count is *lower*, so it is missing records, not a points-mapping gap (an unmapped `story_points` would make SN's no-points count *higher*). | code (reconciliation) | diagnosing |
| 2 | 269821 | Epics: ADO Number field missing from form; ADO stories not linked to Epic | Form missing `u_ado_number`; `System.Parent` → Epic link not set | config + code | open |
| 3 | 269817 | Releases: no stories listed under a Release in SN | Release not mapped / stories not linked to release | config + code | open |
| 4 | 269823 | Themes: ADO Number not populated; epics/stories not linked to Theme | `u_ado_number` not set on theme; hierarchy linking missing | code | open |
| 5 | 269818 | Stories: Theme/Epic/Points/Sprint/Release blank; ADO Number & Priority not on form; count SN 4,797 vs ADO 6,077 | Missing field maps; missing records; form fields; priority choice map | config + code | open |
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

## Constraint

Fixes are developed in this repo. Instance-only configuration (form layouts, field
maps, choice maps, project discovery) is specified here with step-by-step detail and
applied in the ServiceNow instance.
