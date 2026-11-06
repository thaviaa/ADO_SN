# Defect 18 — Cloud Landing Zone: epics not all showing in Project Workspace

- **ADO work item:** 270086
- **Tester:** Betsy Kinney
- **Status:** ✅ NOT A DATA BUG — closed 11/06/2026 (view filter, not missing data)

## Finding

All **23** ADO Landing Zone epics are present in SN as `rm_epic` and all are linked to the
single **Cloud Landing Zone Remediation** project (`PRJ0010017`, sys_id `7382e0e1…`).

Only ~5–10 appeared in the Epics view because the **Scrum "Epics" view applies an
`active=true` filter**. Of the 23, **13 are Complete** (`active=false`) and are therefore
hidden by that filter; the ~10 active ones show. Nothing is missing.

### Important correction (self-caught during triage)

An earlier pass mis-read `pm_project` and reported "84 duplicate Cloud Landing Zone
projects." That was wrong: `pm_project.name` is **blank** on every record (the real name
lives in `short_description`), so `addQuery('name', 'Cloud Landing Zone Remediation')`
matched all 84 *different* projects. **There is exactly 1 CLZ project, 0 duplicates.** The
"consolidation" idea was retracted. Lesson recorded in `docs/notes.md`.

## Validation steps (given to tester)

1. Open the **Cloud Landing Zone Remediation** project workspace.
2. Epics view → remove/relax the **Active = true** filter (or add a condition
   `Active = false`) → all 23 epics list, incl. the 13 Complete.
3. Confirm each epic's **Project = Cloud Landing Zone Remediation** and it carries an
   **ADO Number** (`u_ado_number`).

No config or data change required. Nothing to migrate to Dev.
