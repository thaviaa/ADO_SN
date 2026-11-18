// ADO-SN Audit Fields and Comments Sync - one-time sync for records already imported.
// UAT bugs 271047 (Theme created/updated by + comments) and 271048 (Epic description).
//   Themes : Created by, Updated by, Description (if empty, plain text), Comments -> Work notes
//   Epics  : Created by, Updated by, Description (if empty, HTML), Comments -> Work notes
//   Stories: Created by, Updated by (description/AC/comments = Story Work Items Backfill job)
// Uses ADOSNWorkItemSync. setWorkflow(false): no business rules, nothing sent back to ADO.
// Data change - NOT update-set tracked; run per environment. Use "Proceed in Background".
//
// Settings:
//   DRY_RUN   true = report only (no ADO comment calls). false = write.
//   TABLES    which tables to sync, in order.
//   LIMIT     0 = all ADO-linked records per table. N = first N per table (testing).
//   COMMENTS  true = also pull comments for Themes/Epics (one ADO call per record).
//
// ServiceNow: Fix Script "ADO-SN Audit Fields and Comments Sync"
// meckncdev: MECK - AT - P59 ADO-SN UAT BUGS 2 (271047-271064)

(function () {
    var DRY_RUN = true;
    var TABLES = ['scrum_theme', 'rm_epic', 'rm_story'];
    var LIMIT = 0;
    var COMMENTS = true;

    function log(m) { gs.info('[AUDIT-SYNC] ' + m); gs.print('[AUDIT-SYNC] ' + m); }
    var sync = new ADOSNWorkItemSync();
    if (!sync.hasToken()) { log('ABORT: no ADO token. Click "Get OAuth Token" on the Azure DevOps OAuth credential, then re-run.'); return; }

    TABLES.forEach(function (table) {
        var recs = [];
        var g = new GlideRecord(table);
        g.addNotNullQuery('u_ado_number');
        g.orderBy('u_ado_number');
        if (LIMIT) g.setLimit(LIMIT);
        g.query();
        while (g.next()) recs.push({ sysId: g.getUniqueValue(), ado: g.getValue('u_ado_number') });

        var c = { records: recs.length, changed: 0, created_by: 0, updated_by: 0, description: 0, comments: 0, notInAdo: 0 };
        for (var i = 0; i < recs.length; i += 200) {
            var slice = recs.slice(i, i + 200);
            var fields = sync.fetchFields(slice.map(function (x) { return x.ado; }));
            for (var s = 0; s < slice.length; s++) {
                var f = fields[String(slice[s].ado)];
                if (!f) { c.notInAdo++; continue; }
                var gr = new GlideRecord(table);
                if (!gr.get(slice[s].sysId)) continue;
                var ch = sync.syncRecord(gr, { fields: f, dryRun: DRY_RUN, comments: COMMENTS && table !== 'rm_story' });
                if (ch.length) c.changed++;
                ch.forEach(function (k) { c[k]++; });
            }
        }
        log((DRY_RUN ? 'DRY RUN ' : 'COMMIT ') + table + ' ' + JSON.stringify(c) + (DRY_RUN && COMMENTS && table !== 'rm_story' ? ' (comments not counted in dry run)' : ''));
    });
})();
