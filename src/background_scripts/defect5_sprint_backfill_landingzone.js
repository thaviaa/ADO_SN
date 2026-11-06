// Defect 5 (Sprint) - backfill rm_sprint + link stories for ITS - Landing Zone
// Remediation (Cloud Landing Zone). Scripts - Background, global scope. DATA work
// (not update-set tracked). DRY_RUN = true first, then false.
//
// Why: story.sprint -> rm_sprint, but the integration creates rm_sprint via
// ADOSprintUtil.handleSprint DURING work-item import - and that only runs for
// (re)processed work items. Landing Zone's existing 6k stories weren't reprocessed
// (import is incremental), so its sprints were never created. There is no sprint
// field map. This mirrors the OOTB shell: an rm_sprint whose short_description is
// the sprint name, linked to its ADO iteration via an external-id row
// (reference_table=rm_sprint, external_id=iteration GUID). Then each Landing Zone
// story is linked to the sprint matching its own ado_iteration (already on the
// story's external-id row). Dates/state are pulled from ADO best-effort.

(function () {
    var DRY_RUN = true;
    var ADO_PROJECT = 'ITS - Landing Zone Remediation';
    var LZ_PROJECT_PREFIX = '7c53ca30'; // sn_ado_int_project sys_id prefix

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken(false);
    var org = util.ADO_ORG_URL;

    // 1. iteration dates from ADO (best-effort)
    var dateByGuid = {};
    try {
        var rq = new sn_ws.RESTMessageV2();
        rq.setHttpMethod('GET');
        rq.setEndpoint(org + '/' + encodeURIComponent(ADO_PROJECT) + '/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=7.1');
        rq.setRequestHeader('Authorization', 'Bearer ' + token);
        var rp = rq.execute();
        if (rp.getStatusCode() == 200) {
            (function walk(n) {
                if (!n) return;
                if (n.identifier) { var at = n.attributes || {}; dateByGuid[('' + n.identifier).toLowerCase()] = { start: at.startDate, finish: at.finishDate }; }
                var ch = n.children || [];
                for (var i = 0; i < ch.length; i++) walk(ch[i]);
            })(JSON.parse(rp.getBody()));
        }
    } catch (ex) { gs.info('[SPRINT-BACKFILL] date fetch failed (continuing without dates): ' + ex); }

    // 2. create rm_sprint per leaf iteration (if missing)
    var pr = new GlideRecord('sn_ado_int_project');
    pr.addEncodedQuery('sys_idSTARTSWITH' + LZ_PROJECT_PREFIX);
    pr.query();
    if (!pr.next()) { gs.info('[SPRINT-BACKFILL] ABORT: LZ project not found'); return; }
    var lz = pr.getUniqueValue();

    var sprintByIter = {}; // sn_ado_int_iteration sys_id -> rm_sprint sys_id
    var created = 0, existed = 0;
    var it = new GlideRecord('sn_ado_int_iteration');
    it.addQuery('ado_project', lz);
    it.addQuery('has_children', 'false');
    it.query();
    while (it.next()) {
        var guid = it.getValue('identifier');
        var iterSysId = it.getUniqueValue();
        var iterName = it.getValue('name');
        var ex = new GlideRecord('sn_int_common_external_identifiers');
        ex.addQuery('reference_table', 'rm_sprint');
        ex.addQuery('external_id', guid);
        ex.query();
        if (ex.next()) { sprintByIter[iterSysId] = ex.getValue('reference_value'); existed++; continue; }
        if (DRY_RUN) { sprintByIter[iterSysId] = 'DRY'; created++; continue; }
        var sp = new GlideRecord('rm_sprint');
        sp.initialize();
        sp.setValue('short_description', iterName);
        var d = dateByGuid[('' + guid).toLowerCase()];
        if (d) { if (d.start) sp.setValue('start_date', d.start); if (d.finish) sp.setValue('end_date', d.finish); }
        sp.setWorkflow(false);
        var spId = sp.insert();
        var ne = new GlideRecord('sn_int_common_external_identifiers');
        ne.initialize();
        ne.setValue('reference_table', 'rm_sprint');
        ne.setValue('reference_value', spId);
        ne.setValue('external_id', guid);
        ne.setValue('ado_iteration', iterSysId);
        ne.setWorkflow(false);
        var neId = ne.insert();
        var sp2 = new GlideRecord('rm_sprint');
        if (sp2.get(spId)) { sp2.setValue('external_identifier', neId); sp2.setWorkflow(false); sp2.update(); }
        sprintByIter[iterSysId] = spId;
        created++;
    }

    // 3. link stories whose ado_iteration is one of those leaf iterations
    var linked = 0, already = 0;
    for (var iterId in sprintByIter) {
        var spId2 = sprintByIter[iterId];
        var e = new GlideRecord('sn_int_common_external_identifiers');
        e.addQuery('reference_table', 'rm_story');
        e.addQuery('ado_iteration', iterId);
        e.query();
        while (e.next()) {
            var s = new GlideRecord('rm_story');
            if (!s.get(e.getValue('reference_value'))) continue;
            if (s.getValue('sprint') === spId2 && spId2 !== 'DRY') { already++; continue; }
            if (!DRY_RUN) { s.setValue('sprint', spId2); s.setWorkflow(false); s.update(); }
            linked++;
        }
    }

    gs.info('[SPRINT-BACKFILL] ' + (DRY_RUN ? 'DRY RUN' : 'DONE') +
        ' leafIterations: created=' + created + ' alreadyHadSprint=' + existed +
        ' | storyLinks: ' + (DRY_RUN ? 'wouldLink=' : 'linked=') + linked + ' alreadyLinked=' + already);
})();
