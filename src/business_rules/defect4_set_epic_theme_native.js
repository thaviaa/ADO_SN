// Business Rule: "Defect 4 - Set Epic Theme for native related list (ADO)"
// Table: scrum_theme | When: async | Insert + Update | Advanced: true
// Condition: !current.u_ado_number.nil() && current.u_ado_number.changes()
//
// NATIVE RELATED-LIST APPROACH (chosen 11/05/2026, replaces the u_parent_epic
// field approach). Betsy wanted the parent Epic to show in the Theme form's
// native "Epics" related list, which is driven by rm_epic.theme. So on Theme
// sync we set the parent Epic's rm_epic.theme to this Theme.
//
// IMPORTANT LIMITATION: rm_epic.theme is single-valued and points the OOTB
// direction (Theme-is-parent). Our model is Epic > Theme (one Epic parents many
// Themes - up to 72 here), so an Epic can only point back to ONE Theme. We set it
// only when empty (ep.theme.nil()) so we don't steal the Epic away from a Theme
// that already displays it. Result: each Epic shows under exactly one of its child
// Themes; the rest show an empty Epics list. This was an explicit business choice
// over the custom "Parent Epic" related list (which would cover all Themes).
//
// The old BR "Defect 4 - Set Theme Parent Epic from Feature parent (ADO)" is
// DEACTIVATED and the u_parent_epic field was removed from the Theme form.

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

    var ep = new GlideRecord('rm_epic');
    if (ep.get(epicId) && ep.theme.nil()) {
        ep.setValue('theme', current.getUniqueValue());
        ep.setWorkflow(false);
        ep.update();
    }
})(current, previous);
