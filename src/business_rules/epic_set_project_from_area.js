// Business Rule: "Set Epic Project from ADO area"
// Table: rm_epic | When: async | Insert + Update | Advanced: true
// Condition: !current.u_ado_number.nil() && (current.u_ado_number.changes() || current.u_project.nil())
//
// PRIMARY Epic -> Project mapping. Resolves the epic's project the same way stories
// resolve theirs: take the epic's ADO area (external-id ado_area -> sn_ado_int_area
// name), use the leaf, strip the "ITPMO - " / "ITPMO - " prefix, and match
// pm_project by SHORT_DESCRIPTION (the project's real display field; `name` is empty).
// Covers ~136 of 192 epics. Epics at the root "ITS - ServiceNow" area don't resolve
// here (no single project) - those are left to the child-story fallback BR
// "Set Epic Project from child story".
//
// Why not the OOTB field map: it looked up "Project Name" (the empty `name` column)
// and fed the full System.AreaPath, so it matched nothing.

(function executeRule(current, previous) {
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
        var leaf = areaName.split(/[\\\/]/).pop();
        var stripped = leaf.replace(/^\s*ITPMO\s*[-–]\s*/, '');
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
})(current, previous);
