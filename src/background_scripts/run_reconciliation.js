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

// ---- STEP 4: Cloud Landing Zone (UAT Defects 1 & 5) ----
// Tester's "Cloud Landing Zone" = this area path under the Landing Zone project.
// Watch for: MISSING count, "Missing with NO story points" (ties to the 83 vs 63
// delta in Defect 1), and the STATE/AREA breakdown.
new ADOReconciliationUtil().reconcile(
    'ITS - Landing Zone Remediation',
    'User Story',
    'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation'
);
