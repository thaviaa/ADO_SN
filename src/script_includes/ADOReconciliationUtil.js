var ADOReconciliationUtil = Class.create();
ADOReconciliationUtil.prototype = {

    initialize: function() {
        // Reuse the backfill util's tested auth + org URL so there is one
        // place to configure credentials.
        this.util = new ADOWorkItemBackfillUtil();
        this.ADO_ORG_URL = this.util.ADO_ORG_URL;
        this.API_VERSION = '7.1';
        this.LOG_PREFIX = '[ADOReconciliationUtil] ';

        // ADO work item type -> ServiceNow reference_table value in the external
        // identifiers table (same string as the target table name).
        this.TYPE_MAP = {
            'User Story': 'rm_story',
            'Epic': 'rm_epic',
            'Feature': 'rm_feature'
        };

        // The integration keeps the ADO<->SN link in this table, one row per
        // synced record. This is the authoritative SN key source (does NOT
        // depend on u_ado_number being populated on the record).
        this.EXT_TABLE = 'sn_int_common_external_identifiers';
        this.EXT_ID_FIELD = 'external_id'; // the ADO work item number
        this.EXT_REF_TABLE_FIELD = 'reference_table'; // 'rm_story' etc.
        this.EXT_AREA_FIELD = 'ado_area'; // display = full ADO area path
        this.EXT_PROJECT_FIELD = 'external_project'; // display = ADO project
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

    /**
     * UAT Defect 1 diagnostic. The reconciliation proved the stories are all
     * imported, so the 83-vs-63 "no story points" delta is a view/mapping
     * difference, not missing records. This counts how many SN stories in the
     * area actually have no story_points, UNFILTERED, and breaks it down by
     * state - so you can tell whether the tester's 63 is a filtered board view
     * (states excluded) or a story_points mapping problem.
     *
     *   new ADOReconciliationUtil().storyPointsAudit(
     *     'ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation');
     *
     * Interpretation vs ADO's 83:
     *   - SN no-points ~= 83  -> tester's 63 is a FILTERED board view; align the
     *                            SN Agile Board backlog filter to the ADO query.
     *   - SN no-points ~= 63  -> story_points is mapped onto ~20 stories that have
     *                            none in ADO; it's a field-map / default-value bug.
     */
    storyPointsAudit: function(project, areaPath) {
        var sysIds = [];
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.query();
        while (e.next()) {
            if (areaPath) {
                var area = e.getDisplayValue(this.EXT_AREA_FIELD) || '';
                if (area.indexOf(areaPath) !== 0)
                    continue;
            }
            sysIds.push(e.getValue('reference_value'));
        }

        var total = 0, noPts = 0, byStateNoPts = {};
        for (var i = 0; i < sysIds.length; i += 500) {
            var chunk = sysIds.slice(i, i + 500);
            var g = new GlideRecord('rm_story');
            g.addQuery('sys_id', 'IN', chunk.join(','));
            g.query();
            while (g.next()) {
                total++;
                if (gs.nil(g.getValue('story_points'))) {
                    noPts++;
                    var st = g.getDisplayValue('state') || g.getValue('state');
                    byStateNoPts[st] = (byStateNoPts[st] || 0) + 1;
                }
            }
        }

        gs.info(this.LOG_PREFIX + 'SN area stories: ' + total +
            ' | with NO story_points: ' + noPts + ' (ADO reported 83)');
        gs.info(this.LOG_PREFIX + 'SN no-points by STATE: ' + JSON.stringify(byStateNoPts));
        return { total: total, noPoints: noPts, byState: byStateNoPts };
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
        var snSet = this._getSnKeySet(table, null, null); // all synced records of this type
        return this._compare(adoIds, snSet, 'ALL PROJECTS / ' + workItemType, logAllMissing);
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
        // Scope the SN side to the same area/project so BOTH sides match and
        // the orphan count is meaningful.
        var snSet = this._getSnKeySet(table, project, areaPath);
        var label = project + (areaPath ? ' [' + areaPath + ']' : '') + ' / ' + workItemType;
        return this._compare(adoIds, snSet, label, logAllMissing);
    },

    _compare: function(adoIds, snSet, label, logAllMissing) {
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
            ' | SN synced: ' + snCount +
            ' | MISSING in SN (in ADO, not SN): ' + missing.length +
            ' | ORPHAN in SN (in SN, not ADO): ' + orphans);

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
            gs.info(this.LOG_PREFIX + 'orphan sample (SN external_ids not in ADO): ' +
                orphanSample.join(', '));

        return {
            label: label,
            ado: adoIds.length,
            sn: snCount,
            missing: missing,
            orphans: orphans
        };
    },

    // Fallback state list used when a query overflows 20000 and the per-type
    // states can't be fetched (e.g. org-level global run). Covers Agile/Scrum/
    // Basic/CMMI defaults; custom states would be missed (a warning is logged).
    DEFAULT_STATES: ['New', 'Active', 'Resolved', 'Closed', 'Removed', 'Approved',
        'Committed', 'Done', 'In Progress', 'To Do', 'Proposed', 'Completed',
        'Design', 'Ready', 'Open'],

    /**
     * Pull work-item ids via WIQL. opts = { type, project?, areaPath? }.
     * No project -> org/collection level (all projects). WIQL caps at 20000 per
     * query, so if the query overflows, this auto-partitions by State and unions
     * the results (each partition stays under the cap).
     */
    _getAdoIds: function(opts) {
        var first = this._wiql(opts, null);
        if (!first.overflow)
            return first.ids;

        gs.info(this.LOG_PREFIX + 'Query > 20000 items - partitioning by State...');
        var states = (opts.project ? this._getTypeStates(opts.project, opts.type) : null);
        if (!states || !states.length)
            states = this.DEFAULT_STATES;

        var set = {};
        for (var s = 0; s < states.length; s++) {
            var part = this._wiql(opts, states[s]);
            if (part.overflow)
                gs.warn(this.LOG_PREFIX + 'State "' + states[s] +
                    '" still > 20000 - results for it are incomplete.');
            for (var i = 0; i < part.ids.length; i++)
                set[part.ids[i]] = true;
        }
        var ids = [];
        for (var k in set) {
            if (set.hasOwnProperty(k)) ids.push(k);
        }
        return ids;
    },

    /**
     * Run one WIQL query. Returns { ids: [...], overflow: bool }.
     * overflow=true means the 20000 size limit (VS402337) was hit.
     */
    _wiql: function(opts, stateFilter) {
        var token = this.util._getAccessToken(true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token for WIQL.');
            return { ids: [], overflow: false };
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
        if (stateFilter) {
            var safeState = String(stateFilter).replace(/'/g, "''");
            wiql += " AND [System.State] = '" + safeState + "'";
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

        if (status == 200) {
            var ids = [];
            try {
                var wis = (JSON.parse(body).workItems) || [];
                for (var i = 0; i < wis.length; i++)
                    ids.push(String(wis[i].id));
            } catch (e) {
                gs.error(this.LOG_PREFIX + 'Failed to parse WIQL response: ' + e.message);
            }
            return { ids: ids, overflow: false };
        }

        if (status == 400 && body.indexOf('VS402337') !== -1)
            return { ids: [], overflow: true };

        gs.error(this.LOG_PREFIX + 'WIQL returned ' + status + '. First 300 chars: ' +
            body.substring(0, 300));
        return { ids: [], overflow: false };
    },

    /** Fetch the valid state names for a work item type in a project. */
    _getTypeStates: function(project, type) {
        var token = this.util._getAccessToken(true);
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(this.ADO_ORG_URL + '/' + encodeURIComponent(project) +
            '/_apis/wit/workitemtypes/' + encodeURIComponent(type) +
            '/states?api-version=' + this.API_VERSION);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');
        var resp = r.execute();
        if (resp.getStatusCode() != 200)
            return null;
        try {
            var val = (JSON.parse(resp.getBody() || '{}').value) || [];
            var names = [];
            for (var i = 0; i < val.length; i++)
                names.push(val[i].name);
            return names;
        } catch (e) {
            return null;
        }
    },

    /**
     * Build the set of ADO ids that exist in SN, read straight from the
     * external-identifiers table (the authoritative link). Optionally scope to a
     * project and/or area path so it matches the ADO query's scope.
     *
     *   refTable  - reference_table value ('rm_story', 'rm_epic', ...)
     *   project   - ADO project display (filters external_project) or null
     *   areaPath  - ADO area path; matches ado_area display UNDER this path, or null
     */
    _getSnKeySet: function(refTable, project, areaPath) {
        var set = {};
        var gr = new GlideRecord(this.EXT_TABLE);
        gr.addQuery(this.EXT_REF_TABLE_FIELD, refTable);
        gr.query();
        while (gr.next()) {
            if (areaPath) {
                var area = gr.getDisplayValue(this.EXT_AREA_FIELD) || '';
                // UNDER semantics: the area or any sub-area.
                if (area.indexOf(areaPath) !== 0)
                    continue;
            } else if (project) {
                var proj = gr.getDisplayValue(this.EXT_PROJECT_FIELD) || '';
                if (proj !== project)
                    continue;
            }
            var id = gr.getValue(this.EXT_ID_FIELD);
            if (id)
                set[String(id).trim()] = true;
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
