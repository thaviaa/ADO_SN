// Defect 4 - populate the native "Epics" related list on Theme (rm_epic.theme).
// Run from Scripts - Background. DATA work (not update-set tracked) - re-run per env.
//
// Context: the Theme form's native "Epics" related list shows rm_epic where
// theme = <this theme>. To display each Theme's parent Epic there, set the parent
// Epic's rm_epic.theme to one of its child Themes. Source of the theme->parentEpic
// mapping is scrum_theme.u_parent_epic (already backfilled; still used as data
// lineage even though the field is off the form).
//
// LIMITATION (accepted business choice): rm_epic.theme is single-valued, so an
// Epic that parents many Themes can only appear under ONE of them. In Test this
// left ~356 of 406 Themes with an empty Epics list (50 distinct Epics). We force
// Betsy's validation Theme (THME0011229) to win for its Epic so hers is populated;
// for other Epics we pick the child Theme with the most stories (tie-break: newest
// ADO number).
//
// Going forward the "Defect 4 - Set Epic Theme for native related list (ADO)" BR
// maintains rm_epic.theme on new Theme syncs (sets it only when empty).

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    // story counts per theme
    var storyCount = {};
    var sa = new GlideAggregate('rm_story');
    sa.addNotNullQuery('theme'); sa.groupBy('theme'); sa.addAggregate('COUNT'); sa.query();
    while (sa.next()) storyCount[sa.getValue('theme')] = parseInt(sa.getAggregate('COUNT'), 10);

    // group themes by parent epic
    var byEpic = {}, betsyThemeId = '';
    var g = new GlideRecord('scrum_theme');
    g.addNotNullQuery('u_parent_epic'); g.query();
    while (g.next()) {
        var e = g.getValue('u_parent_epic'), tid = g.getUniqueValue();
        if (g.getValue('number') == 'THME0011229') betsyThemeId = tid;
        (byEpic[e] = byEpic[e] || []).push({
            t: tid,
            ado: parseInt(g.getValue('u_ado_number') || '0', 10),
            s: (storyCount[tid] || 0)
        });
    }

    var epics = 0, updated = 0;
    for (var e in byEpic) {
        epics++;
        var arr = byEpic[e], winner = null;
        for (var i = 0; i < arr.length; i++) { if (arr[i].t == betsyThemeId) winner = arr[i].t; }
        if (!winner) { arr.sort(function (a, b) { return (b.s - a.s) || (b.ado - a.ado); }); winner = arr[0].t; }
        if (!DRY_RUN) {
            var ep = new GlideRecord('rm_epic');
            if (ep.get(e) && ep.getValue('theme') != winner) {
                ep.setValue('theme', winner); ep.setWorkflow(false); ep.update(); updated++;
            }
        }
    }
    gs.info('[D4-NATIVE] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') +
        ' epics=' + epics + ' updated=' + updated + ' betsyThemeFound=' + (betsyThemeId ? 'yes' : 'no'));
})();
