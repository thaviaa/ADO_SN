// Backfill rm_epic.u_project from the epic's ADO area (PRIMARY, area-based).
// Scripts - Background, global scope. DATA work (not update-set tracked) - re-run
// per environment. DRY_RUN = true first, then false to write.
//
// Resolution: epic external-id ado_area -> sn_ado_int_area name -> leaf ->
// strip "ITPMO - " prefix -> match pm_project.short_description (the real display
// field; `name` is empty). Covers ~136 of 192 epics. OVERWRITES any existing value
// on area-resolvable epics (area is authoritative and matches how stories resolve),
// and REPORTS how many it overwrote so you can see the reconciliation with the
// earlier child-derived values. Root-area epics (no area match) are left untouched
// for the child-story BR to fill.

(function () {
    var DRY_RUN = true;          // <-- set false to execute
    var FIELD = 'u_project';

    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'rm_epic'); d.addQuery('element', FIELD); d.query();
    if (!d.next()) { gs.info('[EPIC-PROJ-AREA] ABORT: rm_epic.' + FIELD + ' not found.'); return; }

    // pm_project short_description -> sys_id (lowercased for reliable match)
    var byDesc = {};
    var p = new GlideRecord('pm_project');
    p.query();
    while (p.next()) { var sd = p.getValue('short_description'); if (sd) byDesc[sd.toLowerCase()] = p.getUniqueValue(); }

    var epics = 0, areaResolved = 0, set = 0, overwrote = 0, already = 0, noAreaMatch = 0, noArea = 0;
    var e = new GlideRecord('rm_epic');
    e.addNotNullQuery('u_ado_number');
    e.query();
    while (e.next()) {
        epics++;
        var ext = new GlideRecord('sn_int_common_external_identifiers');
        ext.addQuery('reference_table', 'rm_epic');
        ext.addQuery('reference_value', e.getUniqueValue());
        ext.query();
        var areaName = '';
        if (ext.next()) {
            var aid = ext.getValue('ado_area');
            if (aid) { var a = new GlideRecord('sn_ado_int_area'); if (a.get(aid)) areaName = a.getValue('name') || ''; }
        }
        if (!areaName) { noArea++; continue; }
        var leaf = areaName.split(/[\\\/]/).pop();
        var stripped = leaf.replace(/^\s*ITPMO\s*[-–]\s*/, '').toLowerCase();
        var projId = byDesc[stripped];
        if (!projId) { noAreaMatch++; continue; }
        areaResolved++;
        var cur = e.getValue(FIELD);
        if (cur === projId) { already++; continue; }
        if (cur) overwrote++;
        if (!DRY_RUN) {
            var ep = new GlideRecord('rm_epic');
            if (ep.get(e.getUniqueValue())) { ep.setValue(FIELD, projId); ep.setWorkflow(false); ep.update(); }
        }
        set++;
    }

    gs.info('[EPIC-PROJ-AREA] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') +
        ' epics=' + epics + ' areaResolved=' + areaResolved +
        ' ' + (DRY_RUN ? 'wouldSet=' : 'set=') + set +
        ' overwroteExisting=' + overwrote + ' alreadyCorrect=' + already +
        ' noAreaMatch(root/unmapped)=' + noAreaMatch + ' noArea=' + noArea);
})();
