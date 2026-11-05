// Business Rule: "Set Epic Project from child story"
// Table: rm_story | When: async | Insert + Update | Advanced: true
// Condition: !current.epic.nil() && !current.project.nil() && (current.epic.changes() || current.project.changes())
//
// New defect (Epic -> Project). rm_epic has no usable ADO area->project mapping
// (ADO area paths like "ITS - ServiceNow\ITPMO - X" don't equal pm_project names,
// and epics often sit at a root area), so the OOTB field map can't populate the
// custom rm_epic.u_project field. Instead derive it from the epic's CHILD STORIES,
// which already carry the correct project. This BR sets the parent Epic's u_project
// from a child story's project when the Epic's u_project is still empty (first
// qualifying story wins - stable for epics whose stories span projects). The
// one-time backfill (epic_project_backfill.js) seeds existing epics.

(function executeRule(current, previous) {
    var epicId = current.getValue('epic');
    var projId = current.getValue('project');
    if (!epicId || !projId) return;

    var ep = new GlideRecord('rm_epic');
    if (ep.get(epicId) && ep.u_project.nil()) {
        ep.setValue('u_project', projId);
        ep.setWorkflow(false);
        ep.update();
    }
})(current, previous);
