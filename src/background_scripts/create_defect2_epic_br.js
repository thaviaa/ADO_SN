// Creates the Defect 2 business rule "Set Story Epic from Feature parent (ADO)".
// Run from Scripts - Background with the UAT DEFECT 2_4 update set active (Global).
// Idempotent: skips if a BR of the same name already exists on rm_story.

(function () {
    var NM = 'Defect 2 - Set Story Epic from Feature parent (ADO)';

    var dup = new GlideRecord('sys_script');
    dup.addQuery('name', NM);
    dup.addQuery('collection', 'rm_story');
    dup.query();
    if (dup.next()) { gs.info('[D2-BR] already exists: ' + dup.getUniqueValue()); return; }

    var brScript = [
        "(function executeRule(current, previous) {",
        "    var themeId = current.getValue('theme');",
        "    if (!themeId) return;",
        "    var ft = new GlideRecord('scrum_theme');",
        "    if (!ft.get(themeId)) return;",
        "    var featureAdo = ft.getValue('u_ado_number');",
        "    if (!featureAdo) return;",
        "    var util = new ADOWorkItemBackfillUtil();",
        "    var token = util._getAccessToken(false);",
        "    var r = new sn_ws.RESTMessageV2();",
        "    r.setHttpMethod('GET');",
        "    r.setEndpoint(util.ADO_ORG_URL + '/_apis/wit/workitems/' + featureAdo + '?fields=System.Parent&api-version=7.1');",
        "    r.setRequestHeader('Authorization', 'Bearer ' + token);",
        "    r.setRequestHeader('Accept', 'application/json');",
        "    var resp = r.execute();",
        "    if (resp.getStatusCode() != 200) return;",
        "    var epicAdo = (JSON.parse(resp.getBody()).fields || {})['System.Parent'];",
        "    if (!epicAdo) return;",
        "    var ext = new GlideRecord('sn_int_common_external_identifiers');",
        "    ext.addQuery('reference_table', 'rm_epic');",
        "    ext.addQuery('external_id', epicAdo);",
        "    ext.query();",
        "    if (!ext.next()) return;",
        "    var epicId = ext.getValue('reference_value');",
        "    if (current.getValue('epic') != epicId) {",
        "        var st = new GlideRecord('rm_story');",
        "        if (st.get(current.getUniqueValue())) { st.setValue('epic', epicId); st.setWorkflow(false); st.update(); }",
        "    }",
        "})(current, previous);"
    ].join('\n');

    var br = new GlideRecord('sys_script');
    br.initialize();
    br.setValue('name', NM);
    br.setValue('collection', 'rm_story');
    br.setValue('when', 'async');            // after-commit, non-blocking (it calls ADO)
    br.setValue('action_insert', true);
    br.setValue('action_update', true);
    br.setValue('active', true);
    br.setValue('advanced', true);
    br.setValue('order', 100);
    br.setValue('condition', "!current.theme.nil() && (current.theme.changes() || current.epic.nil())");
    br.setValue('description', 'Defects 2/4: sets rm_story.epic from the parent Feature\'s parent Epic (ADO System.Parent, two-hop). Pairs with field map System.Parent -> theme and stampAdoNumbers().');
    br.setValue('script', brScript);
    var id = br.insert();
    gs.info('[D2-BR] created: ' + id);
})();
