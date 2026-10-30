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
            // 'Theme' handling is scrum_theme if your model maps it; add as needed.
        };

        // SN reference field that holds the ADO external id, and the custom
        // ADO-number field. The SN key set is built from BOTH so a record keyed
        // either way still matches.
        this.EXTERNAL_ID_FIELD = 'external_identifier'; // display value = ADO number
        this.ADO_NUMBER_FIELD = 'u_ado_number';
    },

    /**
     * Reconcile one ADO project + work item type.
     * Logs ADO count, SN count, and the missing-in-SN count, then profiles the
     * missing set by Area Path and State so the cause is visible.
     *
     *   new ADOReconciliationUtil().reconcile('Cloud Landing Zone', 'User Story');
     */
    reconcile: function(project, workItemType, logAllMissing) {
        var table = this.TYPE_MAP[workItemType];
        if (!table) {
            gs.error(this.LOG_PREFIX + 'No SN table mapped for work item type "' + workItemType + '"');
            return null;
        }

        var adoIds = this._getAdoIds(project, workItemType);
        var snSet = this._getSnKeySet(table);

        var missing = [];
        for (var i = 0; i < adoIds.length; i++) {
            if (!snSet[adoIds[i]])
                missing.push(adoIds[i]);
        }

        var snCount = 0;
        for (var k in snSet) {
            if (snSet.hasOwnProperty(k)) snCount++;
        }

        gs.info(this.LOG_PREFIX + '=== ' + project + ' / ' + workItemType + ' ===');
        gs.info(this.LOG_PREFIX + 'ADO work items: ' + adoIds.length +
            ' | SN keyed records (' + table + '): ' + snCount +
            ' | MISSING in SN: ' + missing.length);

        if (missing.length > 0) {
            this.profileMissing(missing);
            // Sample (or all) the missing ids, chunked so logs don't truncate.
            var toLog = logAllMissing ? missing : missing.slice(0, 100);
            for (var s = 0; s < toLog.length; s += 100) {
                gs.info(this.LOG_PREFIX + 'missing ids [' + s + '..]: ' +
                    toLog.slice(s, s + 100).join(', '));
            }
            if (!logAllMissing && missing.length > 100)
                gs.info(this.LOG_PREFIX + '(' + (missing.length - 100) +
                    ' more — pass logAllMissing=true to dump them all)');
        }

        return {
            project: project,
            type: workItemType,
            ado: adoIds.length,
            sn: snCount,
            missing: missing
        };
    },

    /**
     * Reconcile several project/type pairs in one run.
     *   new ADOReconciliationUtil().reconcileAll([
     *     {project:'Cloud Landing Zone', type:'User Story'},
     *     {project:'Cloud Landing Zone', type:'Epic'},
     *     {project:'ServiceNow FY26',    type:'Epic'}
     *   ]);
     */
    reconcileAll: function(pairs) {
        var results = [];
        for (var i = 0; i < pairs.length; i++)
            results.push(this.reconcile(pairs[i].project, pairs[i].type));
        return results;
    },

    /**
     * Pull every work-item id of a type in a project via WIQL.
     * WIQL returns at most 20000 ids per query.
     */
    _getAdoIds: function(project, workItemType) {
        var token = this.util._getAccessToken(true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token for WIQL on ' + project);
            return [];
        }

        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(this.ADO_ORG_URL + '/' + encodeURIComponent(project) +
            '/_apis/wit/wiql?api-version=' + this.API_VERSION);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestHeader('Accept', 'application/json');

        // Escape single quotes in the type name for WIQL safety.
        var safeType = String(workItemType).replace(/'/g, "''");
        var wiql = "SELECT [System.Id] FROM workitems " +
            "WHERE [System.WorkItemType] = '" + safeType + "'";
        r.setRequestBody(JSON.stringify({ query: wiql }));

        var resp = r.execute();
        var status = resp.getStatusCode();
        var body = resp.getBody() || '';
        if (status != 200) {
            gs.error(this.LOG_PREFIX + 'WIQL returned ' + status + ' for ' + project +
                '. First 300 chars: ' + body.substring(0, 300));
            return [];
        }

        var ids = [];
        try {
            var parsed = JSON.parse(body);
            var wis = parsed.workItems || [];
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
     * Fetch Area Path / State / Iteration for the missing ids (batched, 200 max
     * per call) and tally them. This is the diagnostic payoff: the missing set
     * almost always clusters in one State (e.g. Removed/Closed) or one Area Path
     * that isn't routed into SN.
     */
    profileMissing: function(missingIds) {
        var token = this.util._getAccessToken(true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token for profiling missing items.');
            return null;
        }

        var byArea = {};
        var byState = {};
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
                fields: ['System.AreaPath', 'System.State', 'System.IterationPath',
                    'Microsoft.VSTS.Scheduling.StoryPoints']
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
                    var area = f['System.AreaPath'] || '(none)';
                    var state = f['System.State'] || '(none)';
                    byArea[area] = (byArea[area] || 0) + 1;
                    byState[state] = (byState[state] || 0) + 1;
                    if (gs.nil(f['Microsoft.VSTS.Scheduling.StoryPoints']))
                        noPoints++;
                }
            } catch (e) {
                gs.warn(this.LOG_PREFIX + 'Failed to parse batch chunk at ' + start + ': ' + e.message);
            }
        }

        gs.info(this.LOG_PREFIX + 'Missing by STATE: ' + JSON.stringify(byState));
        gs.info(this.LOG_PREFIX + 'Missing by AREA PATH: ' + JSON.stringify(byArea));
        gs.info(this.LOG_PREFIX + 'Missing with NO story points: ' + noPoints +
            ' (UAT Defect 1 - compare to the 83 vs 63 delta)');
        return { byArea: byArea, byState: byState, noPoints: noPoints };
    },

    type: 'ADOReconciliationUtil'
};
