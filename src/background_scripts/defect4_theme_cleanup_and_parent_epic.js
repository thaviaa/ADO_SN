// Defect 4 - theme dedup + parent-epic backfill. Run from Scripts - Background.
// Prereqs (config, in the update set): scrum_theme.u_parent_epic field (reference
// -> rm_epic) and the "Set Theme Parent Epic" business rule. This script does the
// DATA work (not update-set tracked) - re-run per environment.
//
// Context: an older manual theme set (no ADO#) collided on THME numbers with the
// integration's synced set (with ADO#), because the sys_number THME counter was
// behind the max in use. Steps: (1) delete safe orphan duplicates, (2) advance the
// number counter, (3) backfill u_parent_epic from each Feature's parent Epic.

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    // --- 1. delete safe orphan duplicate themes (no ADO#, has synced twin, 0 stories, 0 epics) ---
    var hasStory = {}; var s1 = new GlideAggregate('rm_story'); s1.addNotNullQuery('theme'); s1.groupBy('theme'); s1.query();
    while (s1.next()) hasStory[s1.getValue('theme')] = true;
    var hasEpic = {}; var e1 = new GlideAggregate('rm_epic'); e1.addNotNullQuery('theme'); e1.groupBy('theme'); e1.query();
    while (e1.next()) hasEpic[e1.getValue('theme')] = true;
    var synced = {}; var g = new GlideRecord('scrum_theme'); g.addNotNullQuery('u_ado_number'); g.query();
    while (g.next()) synced[g.getValue('name')] = true;

    var safe = [];
    var o = new GlideRecord('scrum_theme'); o.addEncodedQuery('u_ado_numberISEMPTY'); o.query();
    while (o.next()) {
        var id = o.getUniqueValue();
        if (synced[o.getValue('name')] && !hasStory[id] && !hasEpic[id]) safe.push(id);
    }
    var del = 0;
    if (!DRY_RUN) {
        for (var i = 0; i < safe.length; i++) { var d = new GlideRecord('scrum_theme'); if (d.get(safe[i])) { d.setWorkflow(false); d.deleteRecord(); del++; } }
    }

    // --- 2. advance the THME number counter past the max in use ---
    var max = 0; var t = new GlideRecord('scrum_theme'); t.query();
    while (t.next()) { var n = parseInt((t.getValue('number') || '').replace(/[^0-9]/g, ''), 10); if (!isNaN(n) && n > max) max = n; }
    var ctr = 0;
    if (!DRY_RUN) {
        var sn = new GlideRecord('sys_number'); sn.addQuery('prefix', 'THME'); sn.query();
        while (sn.next()) { sn.setValue('number', max + 1); sn.update(); ctr++; }
    }

    // --- 3. backfill u_parent_epic from each Feature's parent Epic (ADO) ---
    var util = new ADOWorkItemBackfillUtil(); var token = util._getAccessToken(false); var org = util.ADO_ORG_URL;
    function bp(ids) {
        var map = {};
        for (var k = 0; k < ids.length; k += 200) {
            var chunk = ids.slice(k, k + 200);
            var r = new sn_ws.RESTMessageV2(); r.setHttpMethod('POST');
            r.setEndpoint(org + '/_apis/wit/workitemsbatch?api-version=7.1');
            r.setRequestHeader('Authorization', 'Bearer ' + token); r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestBody(JSON.stringify({ ids: chunk, fields: ['System.Id', 'System.Parent'], errorPolicy: 'omit' }));
            var resp = r.execute();
            if (resp.getStatusCode() == 200) { var vals = JSON.parse(resp.getBody()).value || []; for (var v = 0; v < vals.length; v++) { var f = vals[v].fields || {}; if (f['System.Id'] != null) map[f['System.Id']] = (f['System.Parent'] != null ? f['System.Parent'] : null); } }
        }
        return map;
    }
    var themeByAdo = {}, epicByAdo = {};
    var te = new GlideRecord('sn_int_common_external_identifiers'); te.addQuery('reference_table', 'scrum_theme'); te.query();
    while (te.next()) themeByAdo[te.getValue('external_id')] = te.getValue('reference_value');
    var ee = new GlideRecord('sn_int_common_external_identifiers'); ee.addQuery('reference_table', 'rm_epic'); ee.query();
    while (ee.next()) epicByAdo[ee.getValue('external_id')] = ee.getValue('reference_value');
    var featureEpic = bp(Object.keys(themeByAdo));
    var pe = { set: 0, noEpic: 0 };
    for (var fa in themeByAdo) {
        var epicAdo = featureEpic[fa]; var epicId = epicAdo ? epicByAdo[epicAdo] : null;
        if (!epicId) { pe.noEpic++; continue; }
        if (!DRY_RUN) { var th = new GlideRecord('scrum_theme'); if (th.get(themeByAdo[fa]) && th.getValue('u_parent_epic') !== epicId) { th.setValue('u_parent_epic', epicId); th.setWorkflow(false); th.update(); pe.set++; } }
    }

    gs.info('[D4] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') + ' safeOrphans=' + safe.length + ' deleted=' + del +
        ' maxNumber=' + max + ' countersUpdated=' + ctr + ' parentEpicSet=' + pe.set + ' themesNoEpic=' + pe.noEpic);
})();
