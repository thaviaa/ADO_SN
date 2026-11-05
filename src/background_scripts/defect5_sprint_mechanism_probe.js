// Defect 5 - Sprint mechanism probe (READ-ONLY). Scripts - Background, global scope.
//
// Follow-up to defect5_sprint_bridge_diagnostic.js. The "Sprint Import" transform
// map (u_sprint_import -> rm_sprint) creates rm_sprint records. Question: does the
// WORK-ITEM import create/link a story's sprint on the fly (via GetSprintforTeam),
// or only find an already-created rm_sprint? That decides whether simply running
// the Landing Zone import closes Defect 5, or whether the sprint transform has to
// run first. Reads GetSprintforTeam's source + related method names. Read the [SM] log.

(function () {
    function dump(name, full) {
        var g = new GlideRecord('sys_script_include');
        g.addQuery('name', name); g.query();
        if (!g.next()) { gs.info('[SM] ' + name + ' NOT FOUND'); return; }
        var src = g.getValue('script') || '';
        var re = /([A-Za-z0-9_]+)\s*:\s*function\s*\(([^)]*)\)/g, m, out = [];
        while ((m = re.exec(src)) !== null) out.push(m[1] + '(' + m[2].replace(/\s+/g, ' ').trim() + ')');
        gs.info('[SM] ' + name + ' [' + src.length + ' chars] methods: ' + (out.join(' | ') || 'none'));
        if (full) gs.info('[SM] ' + name + ' SRC:\n' + src.substring(0, 2500));
    }
    dump('GetSprintforTeam', true);
    dump('ADOSprintUtil', false);
    dump('AzureDevOpsImportUtils', false);
    dump('SprintTrackingCommonService', false);

    try {
        var s = new GlideRecord('u_sprint_import');
        if (s.isValid()) {
            var a = new GlideAggregate('u_sprint_import'); a.addAggregate('COUNT'); a.query();
            gs.info('[SM] u_sprint_import staging rows=' + (a.next() ? a.getAggregate('COUNT') : 0));
        } else gs.info('[SM] u_sprint_import INVALID');
    } catch (e) { gs.info('[SM] u_sprint_import err ' + e); }

    gs.info('[SM] DONE');
})();
