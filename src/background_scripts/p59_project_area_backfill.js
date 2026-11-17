// P59 rebuild - ADO area path -> ServiceNow Project, for projects, stories and themes.
// Scripts - Background, global scope. DATA work (not update-set tracked) - run per env,
// AFTER Import Work Items (the ITPMO areas must exist in sn_ado_int_area).
// Needs the pm_project.u_ado_area_path field (update set MECK - AT - P59 ADO-SN REBUILD).
//
// What it does (this is what was run inline in meckncdev on 11/16):
//   1) pm_project.u_ado_area_path = FULL ADO area path ("Project\ITPMO - <name>") for every
//      ITPMO area whose name (minus "ITPMO - ") matches a pm_project short_description.
//      The story field map System.AreaPath -> project looks projects up on this field, so
//      it must be the full path, not just the leaf.
//   2) rm_story.project for already-imported stories, from their ADO area.
//   3) scrum_theme.u_project for ADO-linked themes: from the theme's ADO area; if the link
//      row has no area, from the project most of the theme's stories are in.
// setWorkflow(false) on every write - nothing is sent back to ADO.
//
// Areas at a project ROOT (e.g. "ITS - ServiceNow") are not ITPMO areas and have no
// project - those stories/themes stay blank by design (FY26 vs FY27 is a business call).

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    function log(m) { gs.info('[P59-AREA] ' + m); gs.print('[P59-AREA] ' + m); }
    var probe = new GlideRecord('pm_project');
    if (!probe.isValidField('u_ado_area_path')) { log('ABORT: pm_project.u_ado_area_path missing - commit MECK - AT - P59 ADO-SN REBUILD first.'); return; }

    // 1) project area paths
    var setP = 0, noMatch = [];
    var a = new GlideRecord('sn_ado_int_area');
    a.query();
    while (a.next()) {
        var name = a.getValue('name') || '';
        var leaf = name.split(/[\\\/]/).pop();
        if (!/^\s*ITPMO\s*[-–]/.test(leaf)) continue;
        var full = (a.isValidField('path') && a.getValue('path')) || '';
        if (full.indexOf('\\') < 0) {   // fall back to the area display on a link row
            var ex = new GlideRecord('sn_int_common_external_identifiers');
            ex.addQuery('ado_area', a.getUniqueValue()); ex.setLimit(1); ex.query();
            if (ex.next()) full = ex.getDisplayValue('ado_area');
        }
        if (full.indexOf('\\') < 0) { noMatch.push(name + ' (no full path)'); continue; }
        var stripped = leaf.replace(/^\s*ITPMO\s*[-–]\s*/, '');
        var p = new GlideRecord('pm_project');
        p.addQuery('short_description', stripped); p.setLimit(1); p.query();
        if (!p.next()) { noMatch.push(full); continue; }
        if (p.getValue('u_ado_area_path') !== full && !DRY_RUN) {
            p.setValue('u_ado_area_path', full); p.setWorkflow(false); p.autoSysFields(false); p.update();
        }
        setP++;
    }
    log('projects with area path ' + (DRY_RUN ? '(would set)' : 'set') + '=' + setP + ' | unmatched ITPMO areas=' + noMatch.length + (noMatch.length ? ': ' + noMatch.join(' ; ') : ''));

    // lookup: full area path -> project (in DRY_RUN use what would be set)
    var byPath = {};
    var pp = new GlideRecord('pm_project'); pp.addNotNullQuery('u_ado_area_path'); pp.query();
    while (pp.next()) byPath[pp.getValue('u_ado_area_path')] = pp.getUniqueValue();
    if (DRY_RUN) log('note: DRY_RUN uses only area paths already stored; counts below may be low until committed');

    // 2) stories
    var s = { stories: 0, set: 0, already: 0, noProject: 0 };
    var es = new GlideRecord('sn_int_common_external_identifiers');
    es.addQuery('reference_table', 'rm_story'); es.query();
    while (es.next()) {
        s.stories++;
        var pid = byPath[es.getDisplayValue('ado_area')];
        if (!pid) { s.noProject++; continue; }
        var st = new GlideRecord('rm_story');
        if (!st.get(es.getValue('reference_value'))) continue;
        if (st.getValue('project') === pid) { s.already++; continue; }
        if (!DRY_RUN) { st.setValue('project', pid); st.setWorkflow(false); st.update(); }
        s.set++;
    }
    log('stories ' + JSON.stringify(s));

    // 3) themes
    var t = { themes: 0, viaArea: 0, viaStories: 0, already: 0, blank: 0 };
    var et = new GlideRecord('sn_int_common_external_identifiers');
    et.addQuery('reference_table', 'scrum_theme'); et.query();
    while (et.next()) {
        t.themes++;
        var th = new GlideRecord('scrum_theme');
        if (!th.get(et.getValue('reference_value'))) continue;
        var target = byPath[et.getDisplayValue('ado_area')], how = 'viaArea';
        if (!target && !et.getValue('ado_area')) {
            var ga = new GlideAggregate('rm_story');
            ga.addQuery('theme', th.getUniqueValue()); ga.addNotNullQuery('project');
            ga.addAggregate('COUNT'); ga.groupBy('project'); ga.query();
            var bestN = 0;
            while (ga.next()) { var n = parseInt(ga.getAggregate('COUNT'), 10); if (n > bestN) { bestN = n; target = ga.getValue('project'); } }
            how = 'viaStories';
        }
        if (!target) { t.blank++; continue; }
        if (th.getValue('u_project') === target) { t.already++; continue; }
        if (!DRY_RUN) { th.setValue('u_project', target); th.setWorkflow(false); th.update(); }
        t[how]++;
    }
    log('themes ' + JSON.stringify(t));
    log(DRY_RUN ? 'DRY RUN complete - set DRY_RUN=false to write' : 'DONE');
})();
