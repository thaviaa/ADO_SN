// ADO-SN Hierarchy Sync - link stories to Theme (ADO Feature) + Epic (ADO Epic).
// Defects 2 & 4 / 270097. Source: thaviaa/ADO_SN src/background_scripts/run_hierarchy_sync.js
// Data changes are NOT update-set tracked - run per environment, after Import Work Items
// and after "Meck Backfill Themes ADO number".
//
// Settings (top of the IIFE):
//   DRY_RUN            true  = report only, no writes. false = commit.
//   LIMIT              0     = all matching stories. 100 = first 100 (testing).
//   AREA               ''    = all ADO areas. Or an area path prefix, e.g. 'ITS - Landing Zone Remediation'.
//   STAMP_ADO_NUMBERS  true (commit only) also fills u_ado_number on synced Themes/Epics.
//
// Suggested sequence:
//   1) DRY_RUN=true,  LIMIT=100              -> sanity-check the [HIER] counts
//   2) DRY_RUN=false, LIMIT=100, STAMP=true  -> write 100 records, eyeball them
//   3) DRY_RUN=false, LIMIT=0,   STAMP=true  -> everything
// Output: [HIER] lines (gs.info + gs.print).
// Stories whose ADO parent is an Epic (older items with no Feature level) get Epic only;
// counted as directEpic. themeMissing = parent Feature not synced to SN as a Theme.
//
// ServiceNow: Fix Script "ADO-SN Hierarchy Sync (Story to Theme and Epic)"
// (meckncdev, update set MECK - AT - P59 ADO-SN REBUILD).

(function () {
    var DRY_RUN = true;              // false to commit
    var LIMIT = 100;                 // 0 for all; 100 for a test
    var AREA = '';                   // '' = all areas, or an area path prefix
    var STAMP_ADO_NUMBERS = false;   // true (commit only) to also stamp u_ado_number

    function log(m) { gs.info('[HIER] ' + m); gs.print('[HIER] ' + m); }

    var u = new ADOWorkItemBackfillUtil();
    var token = u._getAccessToken(true);
    if (!token) { log('ABORT: no ADO token. Click "Get OAuth Token" on the Azure DevOps OAuth credential, then re-run.'); return; }
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
            } else {
                log('ADO batch call returned HTTP ' + resp.getStatusCode() + ' for ' + chunk.length + ' ids');
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
    log('themes linked to ADO=' + Object.keys(themeByAdo).length + ', epics linked to ADO=' + Object.keys(epicByAdo).length);

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
        log('stampAdoNumbers ' + JSON.stringify(stamp));
    }

    var pending = [];
    var e = new GlideRecord('sn_int_common_external_identifiers');
    e.addQuery('reference_table', 'rm_story'); e.orderBy('external_id'); e.query();
    while (e.next()) {
        var area = e.getDisplayValue('ado_area') || '';
        if (AREA && area.indexOf(AREA) !== 0) continue;
        pending.push({ adoId: e.getValue('external_id'), sysId: e.getValue('reference_value') });
    }
    if (LIMIT) pending = pending.slice(0, LIMIT);

    var c = { stories: 0, linked: 0, themeSet: 0, epicSet: 0, directEpic: 0, noFeature: 0, themeMissing: 0, epicMissing: 0 };
    for (var b = 0; b < pending.length; b += 200) {
        var slice = pending.slice(b, b + 200);
        var pmap = batchParents(slice.map(function (x) { return x.adoId; }));   // storyAdo -> featureAdo
        for (var s = 0; s < slice.length; s++) {
            c.stories++;
            var fa = pmap[slice[s].adoId];
            if (!fa) { c.noFeature++; continue; }
            // Legacy hierarchy: story parented directly to an Epic (no Feature level).
            // Set Epic only; Theme stays blank (there is no Feature in ADO).
            if (epicByAdo[fa]) {
                c.directEpic++;
                var deid = epicByAdo[fa];
                if (DRY_RUN) { c.epicSet++; c.linked++; continue; }
                var ds = new GlideRecord('rm_story');
                if (!ds.get(slice[s].sysId)) continue;
                if (ds.getValue('epic') !== deid) { ds.setValue('epic', deid); ds.setWorkflow(false); ds.update(); c.epicSet++; c.linked++; }
                continue;
            }
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
    log((DRY_RUN ? 'DRY RUN' : 'COMMIT') + ' AREA=' + (AREA || '(all)') + ' LIMIT=' + LIMIT + ' ' + JSON.stringify(c));
})();
