# Defect 6 — Epics from ADO project "DSS - CCS Provider System" not showing in SPM

- **ADO work item:** 269822
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** ✅ RESOLVED & VALIDATED (Test) — 11/05/2026
- **Expected:** Epics from the ADO project `DSS - CCS Provider System` show in SPM.
- **Actual:** No epics from that project appear.

## Root cause

The DSS – CCS hierarchy never imported because the integration couldn't be configured
for it. The work-item import is scoped/routed by **Team Integration Settings**
(`sn_agile_ado_int_import_settings`), and that record couldn't be created for DSS – CCS:

- The **"DSS - CCS Provider System Team"** ADO team record (`sn_ado_int_team`) had a
  **blank Default Area** — the only team of all 8 with an empty default area.
- The Team Integration Settings form auto-loads Default Area from the team, so for
  DSS – CCS it hung on *"Please wait for the Team's Default Area to load"* and could
  never be saved.
- With no Team Integration Setting, the work-item import had no scope for DSS – CCS,
  so its Features/Epics were never pulled in.

(The team's default area comes from Azure DevOps; DSS – CCS's team had none set on the
ADO side, so SN imported it empty — while the other 7 teams imported a default area
fine.)

## Resolution

1. Set the SN team record's `default_area` to the project's imported area
   **"ITPMO - DSS CCS Provider System"** (`sn_ado_int_team.default_area` →
   `sn_ado_int_area`). The Team Integration Settings form then loaded the Default
   Area instead of hanging.
2. Created the **Team Integration Setting** for DSS – CCS (team → default area →
   assignment group **DSS CCS Provider System**).
3. Ran the project **Import Work Items** pull; the DSS – CCS epics now show in SPM.
   Validated.

### Durable note
Setting `default_area` on the SN team record is an **SN-side bridge**. The lasting
fix is the DevOps team configuring a **default area path for the DSS - CCS team in
Azure DevOps**; otherwise a future "Import Areas, Iterations and Teams" run could
blank it again. Flag to the ADO/DevOps team.

## Related
- Same family as **Defect 9** (FY26) — both were the integration / Team Integration
  Settings setup. FY26's team already had a default area, so it didn't hit the
  "Default Area won't load" wall; DSS – CCS did.
- Webhook **registration** is maintained on the Azure DevOps side; the **pull import**
  (SN-side) is what backfills history.
