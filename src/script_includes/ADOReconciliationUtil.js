var ADOReconciliationUtil = Class.create();
ADOReconciliationUtil.prototype = {

    initialize: function() {
        // Reuse the backfill util's tested auth + org URL so there is one
        // place to configure credentials.
        this.util = new ADOWorkItemBackfillUtil();
        this.ADO_ORG_URL = this.util.ADO_ORG_URL;
        this.API_VERSION = '7.1';
        this.LOG_PREFIX = '[ADOReconciliationUtil] ';

        // ADO work item type -> ServiceNow table that stores it.
        this.TYPE_MAP = {
            'User Story': 'rm_story',
            'Epic': 'rm_epic',
            'Feature': 'rm_feature'
        };

        // SN reference field that holds the ADO external id, and the custom
        // ADO-number field. The SN key set is built from BOTH so a record keyed
        // either way still matches.
        this.EXTERNAL_ID_FIELD = 'external_identifier'; // display value = ADO number
        this.ADO_NUMBER_FIELD = 'u_ado_number';
    },

    // ---------------------------------------------------------------------
    //  DISCOVERY - run these first to learn the real ADO structure.
    //  The testers' "Project" (e.g. "Cloud Landing Zone") is usually an ADO
    //  AREA PATH, not a top-level ADO project. WIQL scoped to a project name
    //  that doesn't exist returns TF200016 / HTTP 404.
    // ---------------------------------------------------------------------

    /** List the real ADO projects. new ADOReconciliationUtil().listProjects(); */
    listProjects: function() {
        var token = this.util._getAccessToken(true);
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(this.ADO_ORG_URL + '/_apis/projects?$top=500&api-version=' + this.API_VERSION);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');
        var resp = r.execute();
        if (resp.getStatusCode() != 200) {
            gs.error(this.LOG_PREFIX + 'listProjects returned ' + resp.getStatusCode() +
                ': ' + (resp.getBody() || '').substring(0, 300));
            return [];
        }
        var val = (JSON.parse(resp.getBody() || '{}').value) || [];
        var names = [];
        for (var i = 0; i < val.length; i++)
            names.push(val[i].name);
        gs.info(this.LOG_PREFIX + 'ADO projects (' + names.length + '): ' + JSON.stringify(names));
        return names;
    },

    /**
     * Print the Area Path tree for a project so you can find where a tester's
     * "project" (e.g. Cloud Landing Zone) actually lives.
     *   new ADOReconciliationUtil().listAreaPaths('ITS - ServiceNow', 5);
     */
    listAreaPaths: function(project, depth) {
        var token = this.util._getAccessToken(true);
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(this.ADO_ORG_URL + '/' + encodeURIComponent(project) +
            '/_apis/wit/classificationnodes/areas?$depth=' + (depth || 5) +
            '&api-version=' + this.API_VERSION);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');
        var resp = r.execute();
        if (resp.getStatusCode() != 200) {
            gs.error(this.LOG_PREFIX + 'listAreaPaths returned ' + resp.getStatusCode() +
                ': ' + (resp.getBody() || '').substring(0, 300));
            return;
        }
        var root = JSON.parse(resp.getBody() || '{}');
        var lines = [];
        this._walkAreas(root, '', lines);
        gs.info(this.LOG_PREFIX + 'Area paths under "' + project + '":\n' + lines.join('\n'));
    },

    _walkAreas: function(node, prefix, lines) {
        if (!node) return;
        var path = prefix ? prefix + '\\' + node.name : node.name;
        lines.push('  ' + path);
        var kids = node.children || [];
        for (var i = 0; i < kids.length; i++)
            this._walkAreas(kids[i], path, lines);
    },

    // ---------------------------------------------------------------------
    //  RECONCILIATION
    // ---------------------------------------------------------------------

    /**
     * Global reconciliation: every ADO work item of a type across the WHOLE
     * org/collection vs every keyed SN record. Reports BOTH directions:
     *   - MISSING in SN (in ADO, not in SN)        -> import gap
     *   - ORPHAN in SN  (keyed in SN, not in ADO)  -> stale/removed in ADO
     *
     *   new ADOReconciliationUtil().reconcileGlobal('User Story');
     */
    reconcileGlobal: function(workItemType, logAllMissing) {
        var table = this.TYPE_MAP[workItemType];
        if (!table) {
            gs.error(this.LOG_PREFIX + 'No SN table mapped for "' + workItemType + '"');
            return null;
        }
        var adoIds = this._getAdoIds({ type: workItemType }); // org-level
        return this._compare(adoIds, table, 'ALL PROJECTS / ' + workItemType, logAllMissing);
    },

    /**
     * Project-scoped reconciliation (use a REAL ADO project name from
     * listProjects()). Optionally restrict to an area path under it.
     *   new ADOReconciliationUtil().reconcile('ITS - ServiceNow', 'User Story');
     *   new ADOReconciliationUtil().reconcile('ITS - ServiceNow', 'User Story', 'ITS - ServiceNow\\Cloud Landing Zone');
     */
    reconcile: function(project, workItemType, areaPath, logAllMissing) {
        var table = this.TYPE_MAP[workItemType];
        if (!table) {
            gs.error(this.LOG_PREFIX + 'No SN table mapped for "' + workItemType + '"');
            return null;
        }
        var adoIds = this._getAdoIds({ project: project, type: workItemType, areaPath: areaPath });
        var label = project + (areaPath ? ' [' + areaPath + ']' : '') + ' / ' + workItemType;
        return this._compare(adoIds, table, label, logAllMissing);
    },

    _compare: function(adoIds, table, label, logAllMissing) {
        var snSet = this._getSnKeySet(table);

        // ADO id lookup for the reverse (orphan) check.
        var adoSet = {};
        for (var a = 0; a < adoIds.length; a++)
            adoSet[adoIds[a]] = true;

        var missing = [];
        for (var i = 0; i < adoIds.length; i++) {
            if (!snSet[adoIds[i]])
                missing.push(adoIds[i]);
        }

        var snCount = 0, orphans = 0, orphanSample = [];
        for (var k in snSet) {
            if (!snSet.hasOwnProperty(k)) continue;
            snCount++;
            if (!adoSet[k]) {
                orphans++;
                if (orphanSample.length < 50) orphanSample.push(k);
            }
        }

        gs.info(this.LOG_PREFIX + '=== ' + label + ' ===');
        gs.info(this.LOG_PREFIX + 'ADO: ' + adoIds.length +
            ' | SN keyed (' + table + '): ' + snCount +
            ' | MISSING in SN: ' + missing.length +
            ' | ORPHAN in SN (not in ADO query): ' + orphans);

        if (missing.length > 0) {
            this.profileMissing(missing);
            var toLog = logAllMissing ? missing : missing.slice(0, 100);
            for (var s = 0; s < toLog.length; s += 100)
                gs.info(this.LOG_PREFIX + 'missing ids [' + s + '..]: ' +
                    toLog.slice(s, s + 100).join(', '));
            if (!logAllMissing && missing.length > 100)
                gs.info(this.LOG_PREFIX + '(' + (missing.length - 100) +
                    ' more - pass logAllMissing=true to dump them all)');
        }
        if (orphans > 0)
            gs.info(this.LOG_PREFIX + 'orphan sample (SN keys not in ADO): ' +
                orphanSample.join(', '));

        return {
            label: label,
            ado: adoIds.length,
            sn: snCount,
            missing: missing,
            orphans: orphans
        };
    },

    /**
     * Pull work-item ids via WIQL. opts = { type, project?, areaPath? }.
     * No project -> org/collection level (all projects). WIQL caps at 20000.
     */
    _getAdoIds: function(opts) {
        var token = this.util._getAccessToken(true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token for WIQL.');
            return [];
        }

        var base = opts.project ?
            this.ADO_ORG_URL + '/' + encodeURIComponent(opts.project) :
            this.ADO_ORG_URL;
        var endpoint = base + '/_apis/wit/wiql?api-version=' + this.API_VERSION;

        var safeType = String(opts.type).replace(/'/g, "''");
        var wiql = "SELECT [System.Id] FROM workitems WHERE [System.WorkItemType] = '" + safeType + "'";
        if (opts.areaPath) {
            var safeArea = String(opts.areaPath).replace(/'/g, "''");
            wiql += " AND [System.AreaPath] UNDER '" + safeArea + "'";
        }

        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(endpoint);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestHeader('Accept', 'application/json');
        r.setRequestBody(JSON.stringify({ query: wiql }));

        var resp = r.execute();
        var status = resp.getStatusCode();
        var body = resp.getBody() || '';
        if (status != 200) {
            gs.error(this.LOG_PREFIX + 'WIQL returned ' + status + '. First 300 chars: ' +
                body.substring(0, 300));
            return [];
        }

        var ids = [];
        try {
            var wis = (JSON.parse(body).workItems) || [];
            for (var i = 0; i < wis.length; i++)
                ids.push(String(wis[i].id));
        } catch (e) {
            gs.error(this.LOG_PREFIX + 'Failed to parse WIQL response: ' + e.message);
        }
        return ids;
    },

    /**
     * Build the set of ADO ids that exist in SN for a table, keyed on BOTH the
     * external-identifier display value AND u_ado_number (either match counts).
     */
    _getSnKeySet: function(table) {
        var set = {};
        var gr = new GlideRecord(table);
        gr.query();
        while (gr.next()) {
            var ext = gr.getDisplayValue(this.EXTERNAL_ID_FIELD);
            if (ext)
                set[String(ext).trim()] = true;
            var num = gr.getValue(this.ADO_NUMBER_FIELD);
            if (num)
                set[String(num).trim()] = true;
        }
        return set;
    },

    /**
     * Fetch Area Path / State / Iteration / Project / Story Points for the
     * missing ids (batched, 200 max per call) and tally them. The missing set
     * almost always clusters in one State (Removed/Closed), one Area Path, or
     * one Project that isn't routed into SN.
     */
    profileMissing: function(missingIds) {
        var token = this.util._getAccessToken(true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token for profiling missing items.');
            return null;
        }

        var byArea = {};
        var byState = {};
        var byProject = {};
        var noPoints = 0; // missing stories with no Story Points (ties to UAT Defect 1)

        for (var start = 0; start < missingIds.length; start += 200) {
            var chunk = missingIds.slice(start, start + 200);
            var idNums = [];
            for (var c = 0; c < chunk.length; c++)
                idNums.push(parseInt(chunk[c], 10));

            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('POST');
            r.setEndpoint(this.ADO_ORG_URL + '/_apis/wit/workitemsbatch?api-version=' + this.API_VERSION);
            r.setRequestHeader('Authorization', 'Bearer ' + token);
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('Accept', 'application/json');
            r.setRequestBody(JSON.stringify({
                ids: idNums,
                fields: ['System.TeamProject', 'System.AreaPath', 'System.State',
                    'System.IterationPath', 'Microsoft.VSTS.Scheduling.StoryPoints']
            }));

            var resp = r.execute();
            if (resp.getStatusCode() != 200) {
                gs.warn(this.LOG_PREFIX + 'workitemsbatch returned ' + resp.getStatusCode() +
                    ' for chunk at ' + start);
                continue;
            }
            try {
                var val = (JSON.parse(resp.getBody() || '{}').value) || [];
                for (var i = 0; i < val.length; i++) {
                    var f = val[i].fields || {};
                    var proj = f['System.TeamProject'] || '(none)';
                    var area = f['System.AreaPath'] || '(none)';
                    var state = f['System.State'] || '(none)';
                    byProject[proj] = (byProject[proj] || 0) + 1;
                    byArea[area] = (byArea[area] || 0) + 1;
                    byState[state] = (byState[state] || 0) + 1;
                    if (gs.nil(f['Microsoft.VSTS.Scheduling.StoryPoints']))
                        noPoints++;
                }
            } catch (e) {
                gs.warn(this.LOG_PREFIX + 'Failed to parse batch chunk at ' + start + ': ' + e.message);
            }
        }

        gs.info(this.LOG_PREFIX + 'Missing by PROJECT: ' + JSON.stringify(byProject));
        gs.info(this.LOG_PREFIX + 'Missing by STATE: ' + JSON.stringify(byState));
        gs.info(this.LOG_PREFIX + 'Missing by AREA PATH: ' + JSON.stringify(byArea));
        gs.info(this.LOG_PREFIX + 'Missing with NO story points: ' + noPoints +
            ' (UAT Defect 1 - compare to the 83 vs 63 delta)');
        return { byProject: byProject, byArea: byArea, byState: byState, noPoints: noPoints };
    },

    type: 'ADOReconciliationUtil'
};
