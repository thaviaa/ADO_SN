# Defect 1 — Backlog count of stories without story points doesn't match ADO

- **ADO work item:** 269816
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test) — permanent sweep set up
- **Reported:** Agile Board backlog "no story points" count (SN) didn't match the
  ADO query (e.g. SN 63/65 vs ADO 57/83).

## Root cause (after full investigation)

**Area drift — ADO area-path moves don't propagate to SN.**

The ADO **service hooks are area-filtered** (`Area = ITPMO - Cloud Landing Zone`),
and DevOps controls that filter. `ADOConstants.EVENT_TYPES` *does* include
`workitem.updated`, and the OOTB processor (`ADOWebhookEventProcessorUtil
._handleNormalizedObj`) *does* update `ado_area` on every processed update — **but
an area-filtered hook never fires when a work item leaves the area.** So when
stories were moved from Cloud Landing Zone up to the `ITS - Landing Zone
Remediation` root, ADO never notified SN, and SN kept the stale `ado_area`,
inflating the area's count.

Ruled out along the way:
- **Not a points-mapping bug** — `StoryPoints -> story_points` is correct;
  `storyPointsCompare` returned match=6023, lost=0.
- **Not deletions** — `validateNoPoints` found 0 of the SN no-points stories in
  the ADO Recycle Bin.
- The earlier "Removed" confusion: *Removed* is a state (still live), not a
  deletion (Recycle Bin). The backlog hides Cancelled/Removed by design.

## Fix (what was done in Test)

22 stories had drifted to the root. Cleared their `project` so they drop out of
the Cloud Landing Zone count:

```javascript
new ADOReconciliationUtil().resyncArea(
    'ITS - Landing Zone Remediation',
    'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation',
    'clearProject', false
);
```

Result: `acted:22` → backlog "No story points" went 65 → **57 = ADO 57**. ✅

## Permanent fix

Since the area filter can't be changed from SN, a weekly **Scheduled Script
Execution** runs the sweep (`resyncArea` clearProject + `handleDeleted` delete):

```javascript
new ADOReconciliationUtil().scheduledSweep(
    'ITS - Landing Zone Remediation',
    'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation'
);
```

## Tools used (in `src/script_includes/ADOReconciliationUtil.js`)

| Method | Purpose |
|--------|---------|
| `validateNoPoints(project, area)` | Prove no-points gap isn't deletions |
| `storyPointsCompare(project, area)` | Prove points map correctly |
| `resyncArea(project, area, action, dryRun)` | Detect/fix area drift (`report`/`clearProject`/`delete`) |
| `handleDeleted(project, area, action, dryRun)` | Clean deleted-in-ADO orphans |
| `deleteByAdoId(adoId)` | Delete one SN story by ADO id (real-time backup) |
| `scheduledSweep(project, area, dryRun)` | One-call weekly sweep |

## TODO
- Replicate the sweep/cleanup in **Dev** and other envs.
- Confirm the scheduled job is created and logging.
