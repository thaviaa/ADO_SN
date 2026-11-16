// ADO-SN Theme Parent Epic Sync - set scrum_theme.u_parent_epic from each ADO Feature's
// parent Epic (System.Parent), so an Epic can show ALL of its Themes (ADO Features) in the
// "Themes" related list on the Epic form (scrum_theme.u_parent_epic).
// Defects 2 & 4. Only the parent-epic step of defect4_theme_cleanup_and_parent_epic.js -
// NO theme deletes and NO THME number-counter changes.
// Data changes are NOT update-set tracked - run per environment, after Import Work Items.
// Going forward the async BR "Defect 4 - Set Theme Parent Epic from Feature parent (ADO)"
// keeps u_parent_epic set on new/changed Theme syncs.
//
// Settings (top of the IIFE):
//   DRY_RUN       true  = report only, no writes. false = commit.
//   LIMIT         0     = all ADO-linked themes. 100 = first 100 (testing).
//   ONLY_MISSING  true  = only themes with an empty u_parent_epic. false = also correct
//                         themes whose parent epic changed in ADO.
//
// Suggested sequence:
//   1) DRY_RUN=true                -> check the [THEME-EPIC] counts
//   2) DRY_RUN=false, LIMIT=100    -> write 100, open an Epic and check its Themes list
//   3) DRY_RUN=false, LIMIT=0      -> everything
//
// ServiceNow: Fix Script "ADO-SN Theme Parent Epic Sync"
// (meckncdev, update set MECK - AT - P59 ADO-SN REBUILD).

(function () {
    var DRY_RUN = true;          // false to commit
    var LIMIT = 0;               // 0 = all; 100 for a test
    var ONLY_MISSING = true;     // false = also re-point themes whose ADO parent changed

    function log(m) { gs.info('[THEME-EPIC] ' + m); gs.print('[THEME-EPIC] ' + m); }

    var u = new ADOWorkItemBackfillUtil();
    var token = u._getAccessToken(true);
    if (!token) { log('ABORT: no ADO token. Click "Get OAuth Token" on the Azure DevOps OAuth credential, then re-run.'); return; }
    var org = u.ADO_ORG_URL;

    // ADO Epic number -> rm_epic sys_id
    var epicByAdo = {};
    var ee = new GlideRecord('sn_int_common_external_identifiers');
    ee.addQuery('reference_table', 'rm_epic');
    ee.query();
    while (ee.next()) epicByAdo[ee.getValue('external_id')] = ee.getValue('reference_value');

    // ADO-linked themes to process: featureAdo -> theme sys_id
    var todo = [];
    var et = new GlideRecord('sn_int_common_external_identifiers');
    et.addQuery('reference_table', 'scrum_theme');
    et.orderBy('external_id');
    et.query();
    while (et.next()) {
        var adoId = et.getValue('external_id');
        if (!/^\d+$/.test(adoId || '')) continue;
        var th = new GlideRecord('scrum_theme');
        if (!th.get(et.getValue('reference_value'))) continue;
        if (ONLY_MISSING && th.getValue('u_parent_epic')) continue;
        todo.push({ adoId: adoId, sysId: th.getUniqueValue(), current: th.getValue('u_parent_epic') || '' });
    }
    if (LIMIT) todo = todo.slice(0, LIMIT);
    log('epics linked to ADO=' + Object.keys(epicByAdo).length + ', themes to check=' + todo.length);

    var c = { themes: todo.length, set: 0, unchanged: 0, noParentInAdo: 0, parentNotAnEpicInSN: 0, notInAdo: 0, httpErr: 0 };
    var perEpic = {};
    for (var i = 0; i < todo.length; i += 200) {
        var slice = todo.slice(i, i + 200);
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(org + '/_apis/wit/workitemsbatch?api-version=7.1');
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({ ids: slice.map(function (x) { return Number(x.adoId); }), fields: ['System.Id', 'System.Parent'], errorPolicy: 'omit' }));
        var resp = r.execute();
        if (resp.getStatusCode() != 200) { c.httpErr++; log('ADO batch HTTP ' + resp.getStatusCode() + ' for ' + slice.length + ' themes'); continue; }
        var parentOf = {};
        (JSON.parse(resp.getBody()).value || []).forEach(function (v) {
            if (v && v.fields && v.fields['System.Id'] != null) parentOf[String(v.fields['System.Id'])] = v.fields['System.Parent'] != null ? String(v.fields['System.Parent']) : '';
        });
        for (var s = 0; s < slice.length; s++) {
            var t = slice[s];
            if (!parentOf.hasOwnProperty(t.adoId)) { c.notInAdo++; continue; }
            var pAdo = parentOf[t.adoId];
            if (!pAdo) { c.noParentInAdo++; continue; }
            var epicId = epicByAdo[pAdo];
            if (!epicId) { c.parentNotAnEpicInSN++; continue; }
            if (t.current === epicId) { c.unchanged++; continue; }
            perEpic[pAdo] = (perEpic[pAdo] || 0) + 1;
            if (!DRY_RUN) {
                var g = new GlideRecord('scrum_theme');
                if (g.get(t.sysId)) { g.setValue('u_parent_epic', epicId); g.setWorkflow(false); g.update(); }
            }
            c.set++;
        }
    }
    var top = Object.keys(perEpic).sort(function (a, b) { return perEpic[b] - perEpic[a]; }).slice(0, 5)
        .map(function (k) { return 'ADO ' + k + '=' + perEpic[k]; }).join(', ');
    log((DRY_RUN ? 'DRY RUN ' : 'COMMIT ') + 'LIMIT=' + LIMIT + ' ' + JSON.stringify(c) + (top ? ' | most themes per epic: ' + top : ''));
})();
