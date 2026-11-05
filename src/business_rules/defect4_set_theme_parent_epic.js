// Business Rule: "Defect 4 - Set Theme Parent Epic from Feature parent (ADO)"
// Table: scrum_theme | When: async | Insert + Update | Advanced: true
// Condition: !current.u_ado_number.nil() && (current.u_ado_number.changes() || current.u_parent_epic.nil())
//
// SN model is Epic > Theme > Story (matches ADO Epic > Feature > Story). A Theme
// (= ADO Feature) has one parent Epic (the Feature's parent). SN's native field
// rm_epic.theme is the reverse direction, so we use a custom scrum_theme.u_parent_epic
// reference (-> rm_epic). This BR sets it from the Feature's parent Epic (live ADO
// System.Parent lookup), matching the Defect 2 story->epic rule.

(function executeRule(current, previous) {
    var featureAdo = current.getValue('u_ado_number');
    if (!featureAdo) return;

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken(false);
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint(util.ADO_ORG_URL + '/_apis/wit/workitems/' + featureAdo +
        '?fields=System.Parent&api-version=7.1');
    r.setRequestHeader('Authorization', 'Bearer ' + token);
    r.setRequestHeader('Accept', 'application/json');
    var resp = r.execute();
    if (resp.getStatusCode() != 200) return;
    var epicAdo = (JSON.parse(resp.getBody()).fields || {})['System.Parent'];
    if (!epicAdo) return;

    var ext = new GlideRecord('sn_int_common_external_identifiers');
    ext.addQuery('reference_table', 'rm_epic');
    ext.addQuery('external_id', epicAdo);
    ext.query();
    if (!ext.next()) return;
    var epicId = ext.getValue('reference_value');

    if (current.getValue('u_parent_epic') != epicId) {
        var t = new GlideRecord('scrum_theme');
        if (t.get(current.getUniqueValue())) {
            t.setValue('u_parent_epic', epicId);
            t.setWorkflow(false);
            t.update();
        }
    }
})(current, previous);
