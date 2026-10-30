// ============================================================
//  ADO <-> ServiceNow reconciliation runner
//  Diagnoses the count mismatches (UAT Defects 1, 5, 6, 9).
//  Paste into Scripts - Background (global scope).
//  Requires ADOWorkItemBackfillUtil (for auth) to be installed.
// ============================================================

// Single project + type. Watch the log for:
//   "ADO work items: N | SN keyed records: M | MISSING in SN: X"
//   "Missing by STATE: {...}"   <- are they Removed/Closed?
//   "Missing by AREA PATH: {...}" <- are they in an un-routed area?
new ADOReconciliationUtil().reconcile('Cloud Landing Zone', 'User Story');

// Dump EVERY missing id (not just the first 100):
// new ADOReconciliationUtil().reconcile('Cloud Landing Zone', 'User Story', true);

// Several project/type pairs in one run (covers Defects 6 & 9):
// new ADOReconciliationUtil().reconcileAll([
//     {project: 'Cloud Landing Zone',        type: 'User Story'},
//     {project: 'Cloud Landing Zone',        type: 'Epic'},
//     {project: 'DSS - CCS Provider System', type: 'Epic'},
//     {project: 'ServiceNow FY26',           type: 'Epic'}
// ]);
