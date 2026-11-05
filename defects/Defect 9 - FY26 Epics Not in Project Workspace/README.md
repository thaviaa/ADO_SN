# Defect 9 — Project Workspace Epics tab shows no FY26 Epics for ServiceNow FY26

- **ADO work item:** 269824
- **Tester:** Quiana Williams · opened 10/28/2026
- **Status:** ✅ RESOLVED & VALIDATED (Test) — 11/05/2026
- **Expected:** Project Workspace → ServiceNow FY26 → Epics tab shows the ADO epics.
- **Actual:** No FY26 epics available (tab empty).

## Root cause

"ServiceNow FY26" = the pm_project **ITS ServiceNow Operational FY26** (PRJ0010065).
The Project Workspace **Epics tab is story-derived** — its relationship lists
`rm_epic` where `sys_id IN (distinct rm_story.epic for the project's stories)`. So an
epic only shows once the project's stories carry it.

FY26's stories had no epic because the parent **Features were never imported as
themes**, and that traced back to the **Azure DevOps integration not being fully
configured** — specifically **Team Integration Settings were empty** (0 records
instance-wide). That table (`sn_agile_ado_int_import_settings`) maps each ADO team to
a default area + assignment group and is what the work-item import uses to scope and
route what it pulls in. With none, the import never brought the hierarchy through.

## Resolution — via the integration (not custom code)

The story↔epic (and the hierarchy) relationship is owned by the **Azure DevOps
integration**, so the fix was to finish the integration setup rather than script the
links:

1. Created **Team Integration Settings** for ITS – ServiceNow (team **ITS -
   ServiceNow Team** → default area `…\ITPMO – ITS ServiceNow Operational FY26` →
   assignment group **ServiceNow Sprint Team**). The team already had its default
   area, so the form loaded without issue (contrast Defect 6).
2. Ran the project **Import Work Items** pull so the Features/Epics come in and the
   story→theme→epic chain forms.
3. Project Workspace → ServiceNow FY26 → **Epics tab now shows the FY26 epics.**
   Validated by Quiana/Jack.

### Note — superseded approach
An earlier code-based backfill was built (a `syncHierarchy` change to resolve epics
directly from the ADO grandparent, plus a `rm_story` business rule) and **reverted**
on 11/05/2026. The relationship comes through the integration; webhooks/registration
are maintained on the Azure DevOps side. Any story `epic`/`theme` values left from
that experiment match the ADO hierarchy, so the import reconciles them.

## Related
- Same family as **Defect 6** (DSS – CCS) — both were the integration/Team
  Integration Settings setup. Defect 6 additionally needed the team's blank Default
  Area fixed first.
- Webhook **registration** is ADO-side (DevOps team); the **pull import** is SN-side
  and is what backfills history.
