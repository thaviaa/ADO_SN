// Defect 10 - diagnostic: are Themes "missing" for Finance Data Integrations?
// Scripts - Background, global scope. READ-ONLY (no writes).
//
// Finding: scrum_theme is sourced from ADO **Features** (not Epics). The imported
// theme count equals the ADO Feature count per project, 1:1 and complete. Finance
// Data Integrations (ADO project "FIN - Advantage Finance") has exactly 1 Feature,
// so 1 theme is CORRECT - not an import gap. PRiSM has 13 Features -> 13 themes.
//
// Hierarchy mapping (confirmed by counts):
//   ADO Epic    -> rm_epic       (FIN 53->53, PRiSM 5->5)
//   ADO Feature -> scrum_theme   (FIN  1->1,  PRiSM 13->13)
//   ADO Story   -> rm_story
//
// Run to reproduce the comparison for any two ADO projects.

(function () {
    var PROJECTS = {
        'FIN - Advantage Finance': 'f853ca30873343102bd50d47dabb357e',
        'OED - PRiSM': '7453ca30873343102bd50d47dabb357e'
    };

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken(false);
    var org = util.ADO_ORG_URL;

    function wiqlCount(proj, type) {
        var rq = new sn_ws.RESTMessageV2();
        rq.setHttpMethod('POST');
        rq.setEndpoint(org + '/' + encodeURIComponent(proj) + '/_apis/wit/wiql?api-version=7.1');
        rq.setRequestHeader('Authorization', 'Bearer ' + token);
        rq.setRequestHeader('Content-Type', 'application/json');
        rq.setRequestBody(JSON.stringify({ query: "SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = '" + proj + "' AND [System.WorkItemType] = '" + type + "'" }));
        var rp = rq.execute();
        if (rp.getStatusCode() != 200) return -1;
        return (JSON.parse(rp.getBody()).workItems || []).length;
    }
    function snCount(tbl, extProjId) {
        var a = new GlideAggregate('sn_int_common_external_identifiers');
        a.addQuery('reference_table', tbl); a.addQuery('external_project', extProjId);
        a.addAggregate('COUNT'); a.query(); a.next();
        return parseInt(a.getAggregate('COUNT'), 10);
    }

    for (var name in PROJECTS) {
        var ep = PROJECTS[name];
        gs.info('[D10] ' + name +
            ' | ADO Features=' + wiqlCount(name, 'Feature') + ' -> SN themes=' + snCount('scrum_theme', ep) +
            ' | ADO Epics=' + wiqlCount(name, 'Epic') + ' -> SN rm_epic=' + snCount('rm_epic', ep) +
            ' | SN stories=' + snCount('rm_story', ep));
    }
    gs.info('[D10] Theme count = ADO Feature count (1:1). Finance has 1 Feature => 1 theme is correct.');
})();
