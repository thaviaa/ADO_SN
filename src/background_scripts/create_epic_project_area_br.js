// Create the "Set Epic Project from ADO area" business rule (PRIMARY epic->project).
// Scripts - Background, global scope. SELECT YOUR NEW DEFECT'S UPDATE SET FIRST.
// Safe to re-run (skips if it already exists). Keep the child-story BR as fallback.

(function () {
    var FIELD = 'u_project';
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'rm_epic'); d.addQuery('element', FIELD); d.query();
    if (!d.next()) { gs.info('[EPIC-PROJ-AREA-BR] ABORT: rm_epic.' + FIELD + ' not found.'); return; }
    gs.info('[EPIC-PROJ-AREA-BR] field rm_epic.' + FIELD + ' OK (reference=' + d.getValue('reference') + ')');

    var dup = new GlideRecord('sys_script');
    dup.addQuery('collection', 'rm_epic');
    dup.addQuery('name', 'Set Epic Project from ADO area');
    dup.query();
    if (dup.next()) { gs.info('[EPIC-PROJ-AREA-BR] already exists: ' + dup.getUniqueValue()); return; }

    var brBody =
`(function executeRule(current, previous) {
    var epicId = current.getUniqueValue();

    function resolveProjectFromArea(id) {
        var ext = new GlideRecord('sn_int_common_external_identifiers');
        ext.addQuery('reference_table', 'rm_epic');
        ext.addQuery('reference_value', id);
        ext.query();
        if (!ext.next()) return null;
        var aid = ext.getValue('ado_area');
        if (!aid) return null;
        var a = new GlideRecord('sn_ado_int_area');
        if (!a.get(aid)) return null;
        var areaName = a.getValue('name') || '';
        var leaf = areaName.split(/[\\\\\\/]/).pop();
        var stripped = leaf.replace(/^\\s*ITPMO\\s*[-\\u2013]\\s*/, '');
        if (!stripped) return null;
        var p = new GlideRecord('pm_project');
        p.addQuery('short_description', stripped);
        p.setLimit(1);
        p.query();
        return p.next() ? p.getUniqueValue() : null;
    }

    var projId = resolveProjectFromArea(epicId);
    if (projId && current.getValue('u_project') != projId) {
        var ep = new GlideRecord('rm_epic');
        if (ep.get(epicId)) {
            ep.setValue('u_project', projId);
            ep.setWorkflow(false);
            ep.update();
        }
    }
})(current, previous);`;

    var br = new GlideRecord('sys_script');
    br.initialize();
    br.setValue('name', 'Set Epic Project from ADO area');
    br.setValue('collection', 'rm_epic');
    br.setValue('when', 'async');
    br.setValue('action_insert', true);
    br.setValue('action_update', true);
    br.setValue('active', true);
    br.setValue('advanced', true);
    br.setValue('order', 190);
    br.setValue('condition', "!current.u_ado_number.nil() && (current.u_ado_number.changes() || current.u_project.nil())");
    br.setValue('description', "Primary Epic->Project: resolves u_project from the epic's ADO area (leaf, ITPMO- prefix stripped) matched to pm_project.short_description. Root-area epics fall back to the child-story BR.");
    br.setValue('script', brBody);
    var id = br.insert();
    gs.info('[EPIC-PROJ-AREA-BR] created BR ' + id);
})();
