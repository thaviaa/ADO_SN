// Business Rule: "Defect 2 - Set Story Epic from Feature parent (ADO)"
// Table: rm_story | When: async | Insert + Update | Advanced: true
// Condition: !current.theme.nil() && (current.theme.changes() || current.epic.nil())
//
// Why: a field map is one hop. Story.System.Parent = Feature (-> theme). The
// Story's Epic is the Feature's parent (grandparent) - two hops - so it needs a
// rule. This reads the Feature's parent Epic live from ADO and sets rm_story.epic.
//
// Pairs with: field map row changed to System.Parent -> theme, and
// stampAdoNumbers() populating u_ado_number on scrum_theme (the Feature ADO id).
// The one-time syncHierarchy() backfill covers existing stories; this keeps new
// and updated ones correct going forward. setWorkflow(false) stops re-trigger.

(function executeRule(current, previous) {
    var themeId = current.getValue('theme');
    if (!themeId) return;

    // Feature (Theme) ADO number
    var ft = new GlideRecord('scrum_theme');
    if (!ft.get(themeId)) return;
    var featureAdo = ft.getValue('u_ado_number');
    if (!featureAdo) return; // run stampAdoNumbers() so Features carry their ADO id

    // Feature's parent Epic, from ADO (System.Parent)
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

    // rm_epic via external-id
    var ext = new GlideRecord('sn_int_common_external_identifiers');
    ext.addQuery('reference_table', 'rm_epic');
    ext.addQuery('external_id', epicAdo);
    ext.query();
    if (!ext.next()) return;
    var epicId = ext.getValue('reference_value');

    if (current.getValue('epic') != epicId) {
        var st = new GlideRecord('rm_story');
        if (st.get(current.getUniqueValue())) {
            st.setValue('epic', epicId);
            st.setWorkflow(false); // do not re-trigger business rules
            st.update();
        }
    }
})(current, previous);
