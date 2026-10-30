// ============================================================
//  ADO <-> ServiceNow reconciliation runner
//  Diagnoses the count mismatches (UAT Defects 1, 5, 6, 9).
//  Paste into Scripts - Background (global scope).
//  Requires ADOWorkItemBackfillUtil (for auth) to be installed.
// ============================================================

// ---- STEP 1: discover the REAL ADO project names ----
// The testers' "project" (e.g. "Cloud Landing Zone") is usually an ADO
// AREA PATH, not a top-level project. Find the real project names first.
new ADOReconciliationUtil().listProjects();

// ---- STEP 2: find where a tester's "project" lives (area path tree) ----
// Use a real project name from step 1.
// new ADOReconciliationUtil().listAreaPaths('ITS - ServiceNow', 5);

// ---- STEP 3: global reconciliation (all projects at once) ----
// The big picture for Defect 5. Reports MISSING in SN and ORPHAN in SN,
// then profiles the missing set by PROJECT / AREA / STATE / points.
// new ADOReconciliationUtil().reconcileGlobal('User Story');
// new ADOReconciliationUtil().reconcileGlobal('Epic');

// ---- STEP 4: scoped to a real project (+ optional area path) ----
// new ADOReconciliationUtil().reconcile('ITS - ServiceNow', 'User Story');
// new ADOReconciliationUtil().reconcile('ITS - ServiceNow', 'User Story',
//     'ITS - ServiceNow\\Cloud Landing Zone');
