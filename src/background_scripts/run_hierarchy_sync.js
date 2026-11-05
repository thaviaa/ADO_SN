// Defects 2 & 4 - link stories to Theme (ADO Feature) + Epic (ADO Epic).
// Self-contained: only needs ADOWorkItemBackfillUtil (for ADO auth). Run from
// Scripts - Background, global scope. Data changes are NOT update-set tracked -
// re-run this per environment.
//
// Knobs (top of the IIFE):
//   DRY_RUN            true  = report only, no writes. false = commit.
//   LIMIT             0     = all stories in the area. 100 = first 100 (testing).
//   STAMP_ADO_NUMBERS true (commit only) also fills u_ado_number on the synced
//                     Themes/Epics. Leave false for a dry run / first test.
//
// Suggested sequence:
//   1) DRY_RUN=true,  LIMIT=100              -> sanity-check the [HIER] counts
//   2) DRY_RUN=false, LIMIT=100, STAMP=true  -> write 100 records, eyeball them
//   3) DRY_RUN=false, LIMIT=0,   STAMP=true  -> full area
//
// Output: a [HIER] line via gs.info with the counts.

(function () {
    var DRY_RUN = true;                           // false to commit
    var LIMIT = 100;                              // 0 for all; 100 for a test
    var AREA = 'ITS - Landing Zone Remediation';
    var STAMP_ADO_NUMBERS = false;               // true (commit only) to also stamp u_ado_number

    var u = new ADOWorkItemBackfillUtil();
    var token = u._getAccessToken(false);
    var org = u.ADO_ORG_URL;

    function batchParents(ids) {
        var map = {};
        for (var i = 0; i < ids.length; i += 200) {
            var chunk = ids.slice(i, i + 200);
            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('POST');
            r.setEndpoint(org + '/_apis/wit/workitemsbatch?api-version=7.1');
            r.setRequestHeader('Authorization', 'Bearer ' + token);
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestBody(JSON.stringify({ ids: chunk, fields: ['System.Id', 'System.Parent'], errorPolicy: 'omit' }));
            var resp = r.execute();
            if (resp.getStatusCode() == 200) {
                var vals = JSON.parse(resp.getBody()).value || [];
                for (var v = 0; v < vals.length; v++) {
                    var f = vals[v].fields || {};
                    if (f['System.Id'] != null) map[f['System.Id']] = (f['System.Parent'] != null ? f['System.Parent'] : null);
                }
            }
        }
        return map;
    }
    function loadExt(t, into) {
        var e = new GlideRecord('sn_int_common_external_identifiers');
        e.addQuery('reference_table', t); e.query();
        while (e.next()) into[e.getValue('external_id')] = e.getValue('reference_value');
    }

    var themeByAdo = {}, epicByAdo = {};
    loadExt('scrum_theme', themeByAdo);
    loadExt('rm_epic', epicByAdo);
    var featureEpic = batchParents(Object.keys(themeByAdo));   // featureAdo -> epicAdo

    if (STAMP_ADO_NUMBERS && !DRY_RUN) {
        var stamp = {};
        ['scrum_theme', 'rm_epic'].forEach(function (t) {
            var n = 0, by = (t === 'scrum_theme' ? themeByAdo : epicByAdo);
            for (var ado in by) {
                var gr = new GlideRecord(t);
                if (gr.get(by[ado]) && gr.getValue('u_ado_number') !== ado) { gr.setValue('u_ado_number', ado); gr.setWorkflow(false); gr.update(); n++; }
            }
            stamp[t] = n;
        });
        gs.info('[HIER] stampAdoNumbers ' + JSON.stringify(stamp));
    }

    var pending = [];
    var e = new GlideRecord('sn_int_common_external_identifiers');
    e.addQuery('reference_table', 'rm_story'); e.orderBy('external_id'); e.query();
    while (e.next()) {
        var area = e.getDisplayValue('ado_area') || '';
        if (area.indexOf(AREA) !== 0) continue;
        pending.push({ adoId: e.getValue('external_id'), sysId: e.getValue('reference_value') });
    }
    if (LIMIT) pending = pending.slice(0, LIMIT);

    var c = { stories: 0, linked: 0, themeSet: 0, epicSet: 0, noFeature: 0, themeMissing: 0, epicMissing: 0 };
    for (var b = 0; b < pending.length; b += 200) {
        var slice = pending.slice(b, b + 200);
        var pmap = batchParents(slice.map(function (x) { return x.adoId; }));   // storyAdo -> featureAdo
        for (var s = 0; s < slice.length; s++) {
            c.stories++;
            var fa = pmap[slice[s].adoId];
            if (!fa) { c.noFeature++; continue; }
            var tid = themeByAdo[fa];
            var ea = featureEpic[fa];
            var eid = ea ? epicByAdo[ea] : null;
            if (!tid) c.themeMissing++;
            if (!eid) c.epicMissing++;
            if (!tid && !eid) continue;
            if (DRY_RUN) { if (tid) c.themeSet++; if (eid) c.epicSet++; c.linked++; continue; }
            var st = new GlideRecord('rm_story');
            if (!st.get(slice[s].sysId)) continue;
            var ch = false;
            if (tid && st.getValue('theme') !== tid) { st.setValue('theme', tid); ch = true; c.themeSet++; }
            if (eid && st.getValue('epic') !== eid) { st.setValue('epic', eid); ch = true; c.epicSet++; }
            if (ch) { st.setWorkflow(false); st.update(); c.linked++; }
        }
    }
    gs.info('[HIER] ' + (DRY_RUN ? 'DRY RUN' : 'COMMIT') + ' LIMIT=' + LIMIT + ' ' + JSON.stringify(c));
})();
