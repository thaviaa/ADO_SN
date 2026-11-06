// Defect 13 - backfill Theme (scrum_theme) description from ADO. Scripts - Background,
// global scope. DATA work (not update-set tracked) - re-run per environment.
//
// The scrum_theme table map has `description <- System.Description`, but existing
// themes were never (re)processed, so Description was blank on most even where ADO
// has one (measured: 289 of 432 themes had an ADO description but blank SN). This
// pulls System.Description from ADO (batched) and sets scrum_theme.description.
//
// Note on "Assigned to": scrum_theme is a STANDALONE table with NO native
// assigned_to field. The ADO assignee is already captured in the custom reference
// field `u_ado_assigned_to` (sys_user), populated by the integration. Per the
// decision, that field is relabeled "Assigned to" and shown on the form (config, in
// update set MECK - AT - 270029 270032 - THEME UAT) - no assignee data backfill is
// possible/needed here.

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken(false);
    var org = util.ADO_ORG_URL;

    var themes = [];
    var g = new GlideRecord('scrum_theme');
    g.addNotNullQuery('u_ado_number');
    g.query();
    while (g.next()) themes.push({ sysId: g.getUniqueValue(), ado: g.getValue('u_ado_number'), descEmpty: !g.getValue('description') });
    var ids = themes.map(function (t) { return t.ado; });

    var adoDesc = {};
    for (var k = 0; k < ids.length; k += 100) {
        var chunk = ids.slice(k, k + 100);
        var rq = new sn_ws.RESTMessageV2();
        rq.setHttpMethod('POST');
        rq.setEndpoint(org + '/_apis/wit/workitemsbatch?api-version=7.1');
        rq.setRequestHeader('Authorization', 'Bearer ' + token);
        rq.setRequestHeader('Content-Type', 'application/json');
        rq.setRequestBody(JSON.stringify({ ids: chunk, fields: ['System.Id', 'System.Description'], errorPolicy: 'omit' }));
        var rp = rq.execute();
        if (rp.getStatusCode() == 200) {
            var vals = JSON.parse(rp.getBody()).value || [];
            for (var v = 0; v < vals.length; v++) { var f = vals[v].fields || {}; if (f['System.Id'] != null) adoDesc[f['System.Id']] = f['System.Description'] || null; }
        }
    }

    var set = 0;
    for (var i = 0; i < themes.length; i++) {
        var t = themes[i];
        var d = adoDesc[t.ado];
        if (!d || !t.descEmpty) continue;
        if (!DRY_RUN) {
            var gr = new GlideRecord('scrum_theme');
            if (gr.get(t.sysId)) { gr.setValue('description', d); gr.setWorkflow(false); gr.update(); }
        }
        set++;
    }
    gs.info('[D13-THEME-DESC] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') + ' themes=' + themes.length +
        ' adoFetched=' + Object.keys(adoDesc).length + ' ' + (DRY_RUN ? 'wouldSet=' : 'set=') + set);
})();
