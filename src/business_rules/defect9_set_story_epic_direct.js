// Business Rule: "Defect 9 - Set Story Epic direct (no synced theme)"
// Table: rm_story | When: async | Insert + Update | Advanced: true
// Condition: current.epic.nil() && current.theme.nil() && !current.u_ado_number.nil()
//
// Why: the Defect 2 BR links a Story's epic via its synced Feature (scrum_theme) -
// it starts from current.theme. But some ADO areas (e.g. "ITS ServiceNow
// Operational FY26") import the Stories without importing their parent Features as
// themes, so those Stories have no theme and the Defect 2 BR never fires - leaving
// the Project Workspace Epics tab empty (the tab lists epics of the project's
// stories). This BR covers that case: when a Story has no theme, it walks the ADO
// parent chain directly (Story -> parent -> [grandparent]) to the Epic and sets
// rm_story.epic from the synced rm_epic. Grandparent Epics are imported even when
// the Features are not.
//
// Complements (does not overlap) the Defect 2 BR: that one fires when theme is set,
// this one when theme is empty.

(function executeRule(current, previous) {
    var storyAdo = current.getValue('u_ado_number');
    if (!storyAdo) return;

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken(false);

    function parentOf(adoId) {
        if (!adoId) return null;
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(util.ADO_ORG_URL + '/_apis/wit/workitems/' + adoId +
            '?fields=System.Parent&api-version=7.1');
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');
        var resp = r.execute();
        if (resp.getStatusCode() != 200) return null;
        var p = (JSON.parse(resp.getBody()).fields || {})['System.Parent'];
        return (p != null) ? p : null;
    }
    function epicIdFor(adoId) {
        if (!adoId) return null;
        var ext = new GlideRecord('sn_int_common_external_identifiers');
        ext.addQuery('reference_table', 'rm_epic');
        ext.addQuery('external_id', adoId);
        ext.query();
        return ext.next() ? ext.getValue('reference_value') : null;
    }

    var parentAdo = parentOf(storyAdo);
    if (!parentAdo) return;
    var epicId = epicIdFor(parentAdo);                 // parent is itself an Epic
    if (!epicId) { epicId = epicIdFor(parentOf(parentAdo)); } // grandparent Epic
    if (!epicId) return;

    if (current.getValue('epic') != epicId) {
        var st = new GlideRecord('rm_story');
        if (st.get(current.getUniqueValue())) {
            st.setValue('epic', epicId);
            st.setWorkflow(false);
            st.update();
        }
    }
})(current, previous);
