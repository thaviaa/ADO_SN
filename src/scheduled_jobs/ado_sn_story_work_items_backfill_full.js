// ADO-SN - Story Work Items Backfill (full, on demand)
// 265080 / 268809. One pass over EVERY rm_story with an ADO Number that is still missing
// html_description or acceptance_criteria - no 5,000 cap, and each story is attempted once
// (stories whose AC is genuinely empty in ADO don't starve the rest, unlike looping backfillAll).
// Pulls Description, Acceptance Criteria and Comments (work notes) from ADO.
// Runs on a scheduler worker: no browser timeout. Re-run any time - it only picks up
// stories that are still missing data. Click "Get OAuth Token" on the Azure DevOps OAuth
// credential right before running; if errors climb after ~1 hour, refresh and re-run.
//
// ServiceNow: Scheduled Script Execution "ADO-SN - Story Work Items Backfill (full, on demand)",
// Run = On Demand -> Execute Now. Progress: System Logs, message contains [ADO-SN FULL BACKFILL].
// mecknctest: MECK - AT - P59 ADO-SN TEST MAPS | meckncdev: MECK - AT - P59 ADO-SN REBUILD
(function () {
    var LOG = '[ADO-SN FULL BACKFILL] ';
    var util = new ADOWorkItemBackfillUtil();
    if (!util._getAccessToken(true)) { gs.error(LOG + 'ABORT: no ADO token. Click Get OAuth Token and re-run.'); return; }

    var ids = [];
    var gr = new GlideRecord('rm_story');
    gr.addNotNullQuery('u_ado_number');
    var qc = gr.addNullQuery('html_description');
    qc.addOrCondition('acceptance_criteria', 'ISEMPTY');
    gr.orderBy('u_ado_number');
    gr.query();
    while (gr.next()) ids.push(gr.getUniqueValue());
    gs.info(LOG + 'START candidates=' + ids.length);

    var r = { processed: 0, updated: 0, skipped: 0, errors: 0 };
    for (var i = 0; i < ids.length; i++) {
        var st = new GlideRecord('rm_story');
        if (!st.get(ids[i])) continue;
        r.processed++;
        try { if (util.backfillRecord(st)) r.updated++; else r.skipped++; }
        catch (e) { r.errors++; gs.error(LOG + 'Error on ' + st.getValue('number') + ' (ADO ' + st.getValue('u_ado_number') + '): ' + e.message); }
        if (r.processed % 500 === 0) gs.info(LOG + 'progress ' + r.processed + '/' + ids.length + ' ' + JSON.stringify(r));
    }
    gs.info(LOG + 'DONE ' + JSON.stringify(r));
})();
