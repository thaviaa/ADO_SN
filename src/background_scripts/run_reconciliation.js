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
// 4th arg exactArea=true -> this exact area path ONLY (matches the business
// intent / the ADO query's "Area Path =" filter). Pass false to include
// sub-areas (UNDER). Scoped exactly, ADO and SN reconcile (e.g. 57 = 57).
new ADOReconciliationUtil().reconcile(
    'ITS - Landing Zone Remediation',
    'User Story',
    'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation',
    true
);
