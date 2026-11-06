// Defect 2 retest - backfill scrum_theme.short_description from the ADO Feature Title.
// Scripts - Background, global scope. DATA work (not update-set tracked) - re-run per env.
//
// Why: scrum_theme.short_description (a mandatory/display field) was blank on existing
// themes. The field map `short_description <- System.Title` exists in the active
// Meck-Agile-Template process map, so NEW themes populate going forward - but themes
// imported before that map was added were never reprocessed (incremental import).
//
// scrum_theme.name already holds the ADO Feature Title (Title -> name map), so we copy
// name -> short_description for any theme whose short_description is blank. (Equivalent
// to "short_description = ADO Feature Title" without ADO REST calls.)
//
// Result when first run (Test, 11/06/2026): backfilled 431, 0 blank remaining.

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    var set = 0, skipped = 0;
    var g = new GlideRecord('scrum_theme');
    g.addNullQuery('short_description');
    g.addNotNullQuery('name');
    g.query();
    while (g.next()) {
        if (!DRY_RUN) {
            g.setValue('short_description', g.getValue('name'));
            g.setWorkflow(false);
            g.update();
        }
        set++;
    }
    gs.info('[D2-THEME-SD] ' + (DRY_RUN ? 'DRY RUN wouldSet=' : 'DONE set=') + set);
})();
