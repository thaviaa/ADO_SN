// Defect 5 - Sprint bridge diagnostic (READ-ONLY). Scripts - Background, global scope.
//
// Context: the story's Sprint field references rm_sprint (which EXTENDS Release),
// but the Azure DevOps integration imports iterations into sn_ado_int_iteration.
// Release-level iterations become rm_release_scrum (Release populates on the story);
// the Sprint-level iterations must be turned into rm_sprint records for the Sprint
// field to resolve - and that step never ran for the ITS - Landing Zone Remediation
// project (Cloud Landing Zone), so its stories have a blank Sprint.
//
// This script is read-only. It reports: (1) how a WORKING synced sprint ties back to
// its ADO iteration (the external-id GUID path), (2) the sn_ado_int_iteration field
// names (to find the leaf/sprint marker), (3) Landing Zone iteration count, and
// (4) the mechanism that creates rm_sprint from iterations (script include /
// scheduled job / transform map). Run it and read the [SPRINT-DX] log lines.

(function () {
    function log(s) { gs.info('[SPRINT-DX] ' + s); }

    // 1. How a WORKING synced sprint ties back to the ADO iteration
    var st = new GlideRecord('rm_story');
    st.addNotNullQuery('sprint');
    st.addNotNullQuery('project');
    st.orderByDesc('sys_updated_on');
    st.setLimit(1);
    st.query();
    if (st.next()) {
        log('WORKING story ' + st.getValue('number') + ' | project=' + st.getDisplayValue('project'));
        var sp = new GlideRecord('rm_sprint');
        if (sp.get(st.getValue('sprint'))) {
            var extSysId = sp.getValue('external_identifier');
            log('  sprint=' + sp.getUniqueValue() + ' | release=' + sp.getDisplayValue('release') + ' | extIdField=' + extSysId);
            if (extSysId) {
                var e = new GlideRecord('sn_int_common_external_identifiers');
                if (e.get(extSysId)) {
                    var guid = e.getValue('external_id');
                    log('  ADO GUID=' + guid + ' | refTable=' + e.getValue('reference_table'));
                    var it = new GlideRecord('sn_ado_int_iteration');
                    it.addEncodedQuery('identifierLIKE' + guid + '^ORnameLIKE' + guid);
                    it.query();
                    log('  sn_ado_int_iteration rows matching that GUID=' + it.getRowCount());
                }
            }
        }
    } else { log('no working sprint-linked story found'); }

    // 2. sn_ado_int_iteration field names (to see the GUID / has-children / leaf fields)
    var fl = [];
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', 'sn_ado_int_iteration'); d.addNotNullQuery('element'); d.query();
    while (d.next()) fl.push(d.getValue('element'));
    log('sn_ado_int_iteration fields: ' + fl.join(','));

    // 3. Landing Zone iteration count
    var p = new GlideRecord('sn_ado_int_project');
    p.addEncodedQuery('nameLIKELanding Zone Remediation');
    p.query();
    if (p.next()) {
        var itc = new GlideAggregate('sn_ado_int_iteration');
        itc.addQuery('ado_project', p.getUniqueValue()); itc.addAggregate('COUNT'); itc.query();
        log('LandingZone sn_ado_int_iteration count=' + (itc.next() ? itc.getAggregate('COUNT') : 0));
    }

    // 4. candidate sprint/iteration sync mechanisms
    var si = [];
    var s = new GlideRecord('sys_script_include');
    s.addEncodedQuery('nameLIKEIteration^ORnameLIKESprint^ORnameLIKEAzureDevOps');
    s.query();
    while (s.next()) si.push(s.getValue('name'));
    log('script includes: ' + si.join(' | '));

    var jb = [];
    var j = new GlideRecord('sysauto_script');
    j.addEncodedQuery('nameLIKEIteration^ORnameLIKESprint^ORnameLIKEAzure DevOps');
    j.query();
    while (j.next()) jb.push(j.getValue('name') + '(active=' + j.getValue('active') + ')');
    log('scheduled jobs: ' + jb.join(' | '));

    // 5. transform maps into rm_sprint / rm_release_scrum
    try {
        var tm = [];
        var t = new GlideRecord('sys_transform_map');
        t.addEncodedQuery('target_table=rm_sprint^ORtarget_table=rm_release_scrum^ORsource_table=sn_ado_int_iteration');
        t.query();
        while (t.next()) tm.push(t.getValue('name') + '[' + t.getValue('source_table') + '->' + t.getValue('target_table') + ']');
        log('transform maps: ' + (tm.join(' | ') || 'none'));
    } catch (ex) { log('transform map check err: ' + ex); }

    log('DONE');
})();
