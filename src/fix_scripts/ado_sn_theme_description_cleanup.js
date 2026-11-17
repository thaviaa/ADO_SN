// ADO-SN Theme Description HTML Cleanup - convert existing scrum_theme.description values that
// contain raw ADO HTML into plain text (ADOSNTextUtil.htmlToText).
// Re-pulls the FULL Feature description from ADO first, because values stored before this fix
// were cut off at 4,000 characters mid-HTML. Falls back to converting the stored value if ADO
// has no description or can't be reached. setWorkflow(false): nothing sent to ADO.
// Data change - NOT update-set tracked; run per environment.
//
// Settings:
//   DRY_RUN  true = report only. false = write.
//   LIMIT    0 = all themes with HTML. 20 = first 20 (testing).
//   REFETCH  true = re-pull from ADO (recommended). false = convert the stored value only.
//
// ServiceNow: Fix Script "ADO-SN Theme Description HTML Cleanup"
// mecknctest: MECK - AT - P59 ADO-SN TEST MAPS | meckncdev: MECK - AT - P59 ADO-SN REBUILD

(function () {
    var DRY_RUN = true;
    var LIMIT = 0;
    var REFETCH = true;

    function log(m) { gs.info('[THEME-DESC] ' + m); gs.print('[THEME-DESC] ' + m); }
    var tu = new ADOSNTextUtil();
    var util = null;
    if (REFETCH) {
        util = new ADOThemeBackfillUtil();
        if (!util._getAccessToken(true)) { log('WARN: no ADO token - converting stored values only. Click "Get OAuth Token" to re-pull full descriptions.'); util = null; }
    }

    var c = { candidates: 0, fromAdo: 0, fromStored: 0, unchanged: 0, truncatedTo4000: 0 };
    var sample = '';
    var g = new GlideRecord('scrum_theme');
    g.addQuery('description', 'CONTAINS', '<');
    g.orderBy('number');
    if (LIMIT) g.setLimit(LIMIT);
    g.query();
    while (g.next()) {
        c.candidates++;
        var text = '', src = 'fromStored';
        if (util && g.getValue('u_ado_number')) {
            try {
                var f = util._getWorkItemFields(g.getValue('u_ado_number'));
                if (f && !gs.nil(f['System.Description'])) { text = tu.htmlToText(f['System.Description']); src = 'fromAdo'; }
            } catch (e) { /* fall back to stored value */ }
        }
        if (!text) text = tu.htmlToText(g.getValue('description'));
        if (text === g.getValue('description')) { c.unchanged++; continue; }
        if (text.indexOf('(truncated - full description in Azure DevOps)') > -1) c.truncatedTo4000++;
        c[src]++;
        if (!sample) sample = g.getValue('number') + ': ' + text.substring(0, 160).replace(/\n/g, ' / ');
        if (!DRY_RUN) {
            g.setValue('description', text);
            g.setWorkflow(false);
            g.autoSysFields(false);
            g.update();
        }
    }
    log((DRY_RUN ? 'DRY RUN ' : 'COMMIT ') + JSON.stringify(c));
    if (sample) log('sample -> ' + sample);
})();
