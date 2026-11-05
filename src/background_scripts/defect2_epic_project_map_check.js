// Defect 2 - Epic -> Project mapping check (READ-ONLY). Scripts - Background, global.
//
// Jack added a `u_project` field on rm_epic (reference pm_project) and an integration
// field map (External System.AreaPath -> Internal u_project, lookup column = Project
// Name). The import did NOT populate it. This script shows WHY, by testing, for a
// sample of ADO epics: their area path, and whether a pm_project matches that path by
// exact name / leaf / prefix-stripped leaf - plus whether the epic is at a root area
// (too high to resolve) and whether its child stories already carry a project (so we
// could derive u_project from the children instead). Read the [EPIC-PROJ] log.

(function () {
    function log(s) { gs.info('[EPIC-PROJ] ' + s); }

    // ---- inspect the field map(s) on rm_epic ----
    try {
        var fm = new GlideRecord('sn_int_common_field_map');
        fm.addQuery('internal_table', 'rm_epic');
        fm.query();
        while (fm.next()) {
            log('FIELDMAP ' + fm.getValue('internal_field') + ' <- ' + fm.getValue('external_field') +
                ' | lookup=' + fm.getValue('lookup_column_name') + ' | active=' + fm.getValue('active'));
        }
    } catch (e) { log('field map read err: ' + e); }

    function matchProj(val) {
        if (!val) return false;
        var p = new GlideRecord('pm_project'); p.addQuery('name', val); p.query(); return p.hasNext();
    }

    var epics = 0, noArea = 0, rootArea = 0, exact = 0, leafM = 0, strippedM = 0, hasStoryProj = 0;
    var samples = [];
    var e = new GlideRecord('rm_epic');
    e.addNotNullQuery('u_ado_number');
    e.setLimit(300);
    e.query();
    while (e.next()) {
        epics++;
        var epicId = e.getUniqueValue();
        var areaPath = '', areaName = '';
        var ext = new GlideRecord('sn_int_common_external_identifiers');
        ext.addQuery('reference_table', 'rm_epic');
        ext.addQuery('reference_value', epicId);
        ext.query();
        if (ext.next()) {
            var aid = ext.getValue('ado_area');
            if (aid) {
                var a = new GlideRecord('sn_ado_int_area');
                if (a.get(aid)) { areaPath = a.getValue('path') || ''; areaName = a.getValue('name') || ''; }
            }
        }
        if (!areaPath && !areaName) { noArea++; continue; }
        var parts = (areaPath || areaName).split(/[\\\/]/);
        var leaf = parts[parts.length - 1];
        var stripped = leaf.replace(/^\s*ITPMO\s*[-–]\s*/, '');
        if (parts.length <= 1) rootArea++;
        if (matchProj(areaPath)) exact++;
        if (matchProj(leaf)) leafM++;
        if (matchProj(stripped)) strippedM++;
        var s = new GlideRecord('rm_story');
        s.addQuery('epic', epicId); s.addNotNullQuery('project'); s.setLimit(1); s.query();
        if (s.hasNext()) hasStoryProj++;
        if (samples.length < 6) samples.push('area="' + (areaName || areaPath) + '" leaf="' + leaf + '" stripped="' + stripped + '"');
    }
    log('epics=' + epics + ' noArea=' + noArea + ' rootArea=' + rootArea +
        ' exactMatch=' + exact + ' leafMatch=' + leafM + ' strippedMatch=' + strippedM +
        ' epicsWithStoryProject=' + hasStoryProj);
    for (var i = 0; i < samples.length; i++) log('sample' + i + ': ' + samples[i]);
    log('DONE');
})();
