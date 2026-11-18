// Script Include: ADOSNWorkItemSync (global, accessible from all application scopes)
// Fills what the OOTB ADO import can't on Stories, Epics and Themes (UAT bugs 271047, 271048):
//   - Created by / Updated by: the field maps System.CreatedBy/ChangedBy -> sys_created_by/
//     sys_updated_by never stick (the platform stamps "system" on insert/update). Written here with
//     autoSysFields(false). Value = the ADO user's ServiceNow user_name (matched on email), else
//     the ADO uniqueName (40 chars).
//   - Description when empty: Theme -> description (plain text via ADOSNTextUtil),
//     Epic -> html_description (HTML kept).
//   - Comments (System.History) -> Theme u_work_notes / Epic work_notes, de-duplicated
//     (reuses ADOWorkItemBackfillUtil._backfillComments).
//   Story description / AC / comments stay with ADOWorkItemBackfillUtil; here Stories get the
//   Created by / Updated by only.
// Writes with setWorkflow(false): no business rules, nothing sent back to ADO.
// Used by BR "ADO-SN - Sync audit fields and comments from ADO" (async) and the fix script
// "ADO-SN Audit Fields and Comments Sync".
var ADOSNWorkItemSync = Class.create();
ADOSNWorkItemSync.prototype = {
    TABLES: {
        scrum_theme: { desc: 'description', html: false, notes: 'u_work_notes' },
        rm_epic: { desc: 'html_description', html: true, notes: 'work_notes' },
        rm_story: { desc: null, html: true, notes: null }
    },

    initialize: function () {
        this.util = new ADOWorkItemBackfillUtil();
        this.text = new ADOSNTextUtil();
        this.users = {};
        this.LOG = '[ADO-SN SYNC] ';
    },

    hasToken: function () {
        return !!this.util._getAccessToken(true);
    },

    // ADO work item id -> fields (CreatedBy, ChangedBy, Description), 200 per call.
    fetchFields: function (adoIds) {
        var out = {};
        var ids = [];
        for (var k = 0; k < adoIds.length; k++) if (/^\d+$/.test(String(adoIds[k]))) ids.push(Number(adoIds[k]));
        for (var i = 0; i < ids.length; i += 200) {
            var chunk = ids.slice(i, i + 200);
            for (var attempt = 0; attempt < 2; attempt++) {
                var token = this.util._getAccessToken(attempt === 1);
                if (!token) { gs.error(this.LOG + 'No ADO token'); return out; }
                var r = new sn_ws.RESTMessageV2();
                r.setHttpMethod('POST');
                r.setEndpoint(this.util.ADO_ORG_URL + '/_apis/wit/workitemsbatch?api-version=7.1');
                r.setRequestHeader('Authorization', 'Bearer ' + token);
                r.setRequestHeader('Content-Type', 'application/json');
                r.setRequestBody(JSON.stringify({ ids: chunk, fields: ['System.Id', 'System.CreatedBy', 'System.ChangedBy', 'System.Description'], errorPolicy: 'omit' }));
                var resp = r.execute();
                var status = resp.getStatusCode();
                if (status == 200) {
                    var vals = (JSON.parse(resp.getBody() || '{}').value) || [];
                    for (var v = 0; v < vals.length; v++) {
                        if (vals[v] && vals[v].fields) out[String(vals[v].fields['System.Id'])] = vals[v].fields;
                    }
                    break;
                }
                if (attempt === 0 && (status == 401 || status == 203 || status == 302)) continue;   // refresh once
                gs.error(this.LOG + 'workitemsbatch HTTP ' + status + ' for ' + chunk.length + ' ids');
                break;
            }
        }
        return out;
    },

    // ADO identity -> ServiceNow user_name (by email), else uniqueName truncated to 40.
    userName: function (identity) {
        if (!identity) return '';
        var email = String(identity.uniqueName || '').toLowerCase();
        if (!email) return '';
        if (this.users.hasOwnProperty(email)) return this.users[email];
        var name = '';
        var u = new GlideRecord('sys_user');
        u.addQuery('email', email);
        u.setLimit(1);
        u.query();
        if (u.next()) name = u.getValue('user_name');
        if (!name) name = email.substring(0, 40);
        this.users[email] = name;
        return name;
    },

    // Sets fields on gr (no update). Returns the list of what changed.
    applyFields: function (gr, f, opts) {
        opts = opts || {};
        var cfg = this.TABLES[gr.getTableName()] || {};
        var changed = [];
        if (opts.audit !== false) {
            var cb = this.userName(f['System.CreatedBy']);
            if (cb && gr.getValue('sys_created_by') !== cb) { gr.setValue('sys_created_by', cb); changed.push('created_by'); }
            var ub = this.userName(f['System.ChangedBy']);
            if (ub && gr.getValue('sys_updated_by') !== ub) { gr.setValue('sys_updated_by', ub); changed.push('updated_by'); }
        }
        if (opts.description !== false && cfg.desc && gs.nil(gr.getValue(cfg.desc)) && !gs.nil(f['System.Description'])) {
            gr.setValue(cfg.desc, cfg.html ? f['System.Description'] : this.text.htmlToText(f['System.Description']));
            changed.push('description');
        }
        return changed;
    },

    // Queue new ADO comments onto the table's journal field (no update). Returns true if any.
    applyComments: function (gr) {
        var cfg = this.TABLES[gr.getTableName()] || {};
        if (!cfg.notes) return false;
        var save = this.util.WORKNOTES_FIELD;
        this.util.WORKNOTES_FIELD = cfg.notes;
        try { return this.util._backfillComments(gr, gr.getValue('u_ado_number')); }
        finally { this.util.WORKNOTES_FIELD = save; }
    },

    // One record. opts: { fields, audit, description, comments, dryRun }. Returns list of changes.
    syncRecord: function (gr, opts) {
        opts = opts || {};
        var adoId = gr.getValue('u_ado_number');
        if (gs.nil(adoId)) return [];
        var f = opts.fields || this.fetchFields([adoId])[String(adoId)];
        if (!f) return [];
        var changed = this.applyFields(gr, f, opts);
        if (opts.comments !== false && !opts.dryRun && this.applyComments(gr)) changed.push('comments');
        if (changed.length && !opts.dryRun) {
            gr.setWorkflow(false);
            gr.autoSysFields(false);
            gr.update();
        }
        return changed;
    },

    syncBySysId: function (table, sysId, opts) {
        var gr = new GlideRecord(table);
        if (!gr.get(sysId)) return [];
        return this.syncRecord(gr, opts);
    },

    type: 'ADOSNWorkItemSync'
};
