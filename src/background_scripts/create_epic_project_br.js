// Create the "Set Epic Project from child story" business rule.
// Scripts - Background, global scope. SELECT YOUR NEW DEFECT'S UPDATE SET FIRST so
// the BR is captured for promotion. Safe to re-run (skips if it already exists).

(function () {
    // 1. verify the custom field exists (adjust 'u_project' if your column differs)
    var FIELD = 'u_project';
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'rm_epic'); d.addQuery('element', FIELD); d.query();
    if (!d.next()) {
        gs.info('[EPIC-PROJ-BR] ABORT: rm_epic.' + FIELD + ' not found. Fix the field name in this script AND the BR body, then re-run.');
        return;
    }
    gs.info('[EPIC-PROJ-BR] field rm_epic.' + FIELD + ' OK (reference=' + d.getValue('reference') + ')');

    // 2. avoid duplicate
    var dup = new GlideRecord('sys_script');
    dup.addQuery('collection', 'rm_story');
    dup.addQuery('name', 'Set Epic Project from child story');
    dup.query();
    if (dup.next()) { gs.info('[EPIC-PROJ-BR] already exists: ' + dup.getUniqueValue()); return; }

    // 3. create the BR
    var brBody =
`(function executeRule(current, previous) {
    var epicId = current.getValue('epic');
    var projId = current.getValue('project');
    if (!epicId || !projId) return;
    var ep = new GlideRecord('rm_epic');
    if (ep.get(epicId) && ep.u_project.nil()) {
        ep.setValue('u_project', projId);
        ep.setWorkflow(false);
        ep.update();
    }
})(current, previous);`;

    var br = new GlideRecord('sys_script');
    br.initialize();
    br.setValue('name', 'Set Epic Project from child story');
    br.setValue('collection', 'rm_story');
    br.setValue('when', 'async');
    br.setValue('action_insert', true);
    br.setValue('action_update', true);
    br.setValue('active', true);
    br.setValue('advanced', true);
    br.setValue('order', 200);
    br.setValue('condition', "!current.epic.nil() && !current.project.nil() && (current.epic.changes() || current.project.changes())");
    br.setValue('description', "Sets parent Epic u_project from a child story's project when empty. Epic->Project is derived from children because ADO area paths do not match pm_project names.");
    br.setValue('script', brBody);
    var id = br.insert();
    gs.info('[EPIC-PROJ-BR] created BR ' + id);
})();
