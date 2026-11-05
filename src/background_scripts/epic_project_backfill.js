// Backfill rm_epic.u_project from each epic's child stories' project.
// Scripts - Background, global scope. DATA work (not update-set tracked) - re-run
// per environment. Leave DRY_RUN = true for a report first, then set false to write.
//
// For each epic, tally the projects of its stories (rm_story.epic = epic, project
// set) and assign the MAJORITY project to u_project. Epics whose stories span
// multiple projects are reported (multiProjectEpics) so you can spot-check them.

(function () {
    var DRY_RUN = true;          // <-- set false to execute
    var FIELD = 'u_project';     // <-- adjust if your column name differs

    // field guard
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'rm_epic'); d.addQuery('element', FIELD); d.query();
    if (!d.next()) { gs.info('[EPIC-PROJ-BACKFILL] ABORT: rm_epic.' + FIELD + ' not found.'); return; }

    // tally project counts per epic from stories
    var counts = {}; // epicId -> { projId: n }
    var ga = new GlideAggregate('rm_story');
    ga.addNotNullQuery('epic');
    ga.addNotNullQuery('project');
    ga.groupBy('epic');
    ga.groupBy('project');
    ga.addAggregate('COUNT');
    ga.query();
    while (ga.next()) {
        var eId = ga.getValue('epic');
        var pId = ga.getValue('project');
        var n = parseInt(ga.getAggregate('COUNT'), 10);
        (counts[eId] = counts[eId] || {})[pId] = n;
    }

    var epics = 0, wouldSet = 0, multi = 0, already = 0, noEpicRec = 0;
    for (var epicId in counts) {
        epics++;
        var best = null, bestN = -1, distinct = 0;
        for (var pId in counts[epicId]) {
            distinct++;
            if (counts[epicId][pId] > bestN) { bestN = counts[epicId][pId]; best = pId; }
        }
        if (distinct > 1) multi++;
        if (!best) continue;
        var ep = new GlideRecord('rm_epic');
        if (!ep.get(epicId)) { noEpicRec++; continue; }
        if (ep.getValue(FIELD) === best) { already++; continue; }
        if (!DRY_RUN) { ep.setValue(FIELD, best); ep.setWorkflow(false); ep.update(); }
        wouldSet++;
    }

    gs.info('[EPIC-PROJ-BACKFILL] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') +
        ' epicsWithStories=' + epics + ' ' + (DRY_RUN ? 'wouldSet=' : 'set=') + wouldSet +
        ' multiProjectEpics=' + multi + ' alreadyCorrect=' + already + ' missingEpicRec=' + noEpicRec);
})();
