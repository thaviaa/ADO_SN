# Defect 9 — Project Workspace Epics tab shows no FY26 Epics for ServiceNow FY26

- **ADO work item:** 269824
- **Tester:** Quiana Williams · opened 10/28/2026
- **Status:** ⏳ OPEN
- **Expected:** Project Workspace → ServiceNow FY26 → Epics tab shows all ADO epics.
- **Actual:** No FY26 epics available.

## Likely root cause

Same family as Defect 6 — epics for a project/area not imported. The ADO project
or area for ServiceNow FY26 may not be registered / enabled / routed, or the Epic
table map isn't present for it. (Area seen elsewhere: `ITS - ServiceNow\ITPMO -
ITS ServiceNow Operational FY26`.)

## Plan
- Check the `sn_ado_int_project` registration + `enable_import` for the FY26
  project, its process/table maps, and area/team settings.
- Confirm Epic import path for that project.

## Notes
- Group with Defect 6 — project/area routing & discovery.
