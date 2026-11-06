// Align project-backlog owners to the project's Project Manager.
// Scripts - Background, global scope. DATA work (not update-set tracked) - re-run per env.
//
// Why: personal/project backlogs (backlog_definition) are owned by whoever created them,
// not the project's PM. Owner-level controls in the Agile Board - the Triage Board link,
// edit, and sharing - only show for the OWNER. So PMs couldn't triage/edit their own
// project's backlog (e.g. Rakhee James is PM of BizTax Replacement but Valerie Thomas
// owned that backlog). This sets owner = pm_project.project_manager for each "PRJ:" backlog.
//
// Mapping: the backlog's `filter` scopes stories to a project via `project=<sysid>`; we
// read that project and its project_manager (reliable - name matching is not).
//
// Safeguard: the previous owner is added to `shared_with` ("Visible to") so they keep
// access to the backlog they set up. Skips backlogs already owned by the PM, with no PM,
// or with no project in the filter.
//
// Result when first run (Test, 11/05/2026): changed 10, skipped 3 (2 already PM, 1 no PM).

(function () {
    var DRY_RUN = true;   // <-- set false to execute
    var RE = new RegExp('project=([0-9a-f]{32})');

    var changed = 0, skipped = 0;
    var g = new GlideRecord('backlog_definition');
    g.addQuery('name', 'STARTSWITH', 'PRJ:');
    g.orderBy('name');
    g.query();
    while (g.next()) {
        var nm = g.getValue('name');
        var ownerId = g.getValue('owner');
        var m = (g.getValue('filter') || '').match(RE);
        if (!m) { skipped++; continue; }
        var p = new GlideRecord('pm_project');
        if (!p.get(m[1])) { skipped++; continue; }
        var pmId = p.getValue('project_manager');
        if (!pmId || pmId === ownerId) { skipped++; continue; }

        var swArr = (g.getValue('shared_with') || '').split(',').filter(function (x) { return x; });
        if (swArr.indexOf(ownerId) < 0) swArr.push(ownerId); // preserve old owner's access

        if (!DRY_RUN) {
            g.setValue('shared_with', swArr.join(','));
            g.setValue('owner', pmId);
            g.setWorkflow(false);
            g.update();
        }
        changed++;
        gs.info('[BACKLOG-OWNER] ' + (DRY_RUN ? 'would set' : 'set') + ' "' + nm +
            '" owner -> ' + p.getDisplayValue('project_manager') + ' (old owner kept in Visible to)');
    }
    gs.info('[BACKLOG-OWNER] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') + ': changed=' + changed + ' skipped=' + skipped);
})();
