# Defect 6 — Epics from ADO project "DSS - CCS Provider System" not showing in SPM

- **ADO work item:** 269822
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** ⏳ OPEN
- **Expected:** Epics from the ADO project `DSS - CCS Provider System` show in SPM.
- **Actual:** No epics from that project appear.

## Likely root cause

The project/area isn't discovered or routed into SN — the `sn_ado_int_project`
record may not be registered / `enable_import` off, or no area/team mapping, so
its work items never import. (`DSS - CCS Provider System` is a real ADO project —
it showed in `testAuth` /projects output.)

## Plan
- Check the `sn_ado_int_project` record for DSS-CCS: registered? `enable_import`?
  process map + table maps present? area/team integration settings configured?
- Confirm a table map exists for Epic (`sn_safe_epic`/`rm_epic`) for this project.

## Notes
- Same family as Defect 9 (FY26 epics missing) — project/area routing/discovery.
