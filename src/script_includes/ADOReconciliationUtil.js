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

    /**
     * UAT Defect 1/5 - Story Points mapping audit. For every story in the area,
     * compare ADO Microsoft.VSTS.Scheduling.StoryPoints to SN story_points and
     * categorize the discrepancy, with samples showing the actual values:
     *   match        - same value both sides
     *   mismatch     - both set but different (mapped from wrong field?)
     *   lost         - ADO has points, SN blank (mapping not pulling)
     *   phantom      - SN has points, ADO blank (default / stale / wrong source)
     *   both-blank    - neither side has points
     *
     *   new ADOReconciliationUtil().storyPointsCompare(
     *     'ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation');
     */
    storyPointsCompare: function(project, areaPath) {
        // SN side: external_id -> story_points (string or null)
        var refToExt = {}, refs = [];
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.query();
        while (e.next()) {
            if (areaPath && (e.getDisplayValue(this.EXT_AREA_FIELD) || '').indexOf(areaPath) !== 0)
                continue;
            var ext = e.getValue(this.EXT_ID_FIELD);
            var ref = e.getValue('reference_value');
            if (ext && ref) { refToExt[ref] = ext; refs.push(ref); }
        }

        var snPoints = {};
        for (var i = 0; i < refs.length; i += 500) {
            var g = new GlideRecord('rm_story');
            g.addQuery('sys_id', 'IN', refs.slice(i, i + 500).join(','));
            g.query();
            while (g.next()) {
                var exid = refToExt[g.getUniqueValue()];
                snPoints[exid] = gs.nil(g.getValue('story_points')) ? null : String(g.getValue('story_points'));
            }
        }

        // ADO side: batch StoryPoints for the same ids.
        var extIds = [];
        for (var key in snPoints) {
            if (snPoints.hasOwnProperty(key)) extIds.push(key);
        }

        var adoPoints = {};
        var adoReturned = {}; // ids ADO actually returned (vs deleted/not found)
        var token = this.util._getAccessToken(true);
        for (var j = 0; j < extIds.length; j += 200) {
            var chunk = extIds.slice(j, j + 200);
            var nums = [];
            for (var c = 0; c < chunk.length; c++) nums.push(parseInt(chunk[c], 10));

            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('POST');
            r.setEndpoint(this.ADO_ORG_URL + '/_apis/wit/workitemsbatch?api-version=' + this.API_VERSION);
            r.setRequestHeader('Authorization', 'Bearer ' + token);
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestBody(JSON.stringify({
                ids: nums,
                fields: ['Microsoft.VSTS.Scheduling.StoryPoints'],
                // omit (not fail) so one deleted id doesn't 404 the whole batch
                // and get miscounted as phantom.
                errorPolicy: 'omit'
            }));
            var resp = r.execute();
            if (resp.getStatusCode() != 200) {
                gs.warn(this.LOG_PREFIX + 'workitemsbatch ' + resp.getStatusCode() + ' at ' + j);
                continue;
            }
            var val = (JSON.parse(resp.getBody() || '{}').value) || [];
            for (var v = 0; v < val.length; v++) {
                var vid = String(val[v].id);
                adoReturned[vid] = true;
                var pts = (val[v].fields || {})['Microsoft.VSTS.Scheduling.StoryPoints'];
                adoPoints[vid] = gs.nil(pts) ? null : String(pts);
            }
        }

        // Compare.
        var match = 0, mismatch = 0, lost = 0, phantom = 0, bothBlank = 0, adoMissing = 0;
        var sMis = [], sLost = [], sPhantom = [];
        for (var id in snPoints) {
            if (!snPoints.hasOwnProperty(id)) continue;
            if (!adoReturned[id]) {
                adoMissing++; // ADO work item deleted / not found - not a mapping issue
                continue;
            }
            var s = snPoints[id];
            var a = adoPoints.hasOwnProperty(id) ? adoPoints[id] : null;
            var sB = (s === null), aB = (a === null);
            if (sB && aB) {
                bothBlank++;
            } else if (!sB && !aB) {
                if (Number(s) === Number(a)) match++;
                else { mismatch++; if (sMis.length < 20) sMis.push(id + ': ADO=' + a + ' SN=' + s); }
            } else if (!aB && sB) {
                lost++; if (sLost.length < 20) sLost.push(id + ': ADO=' + a);
            } else {
                phantom++; if (sPhantom.length < 20) sPhantom.push(id + ': SN=' + s);
            }
        }

        gs.info(this.LOG_PREFIX + 'POINTS COMPARE (' + (areaPath || project || 'ALL') +
            ') over ' + extIds.length + ' stories:');
        gs.info(this.LOG_PREFIX + '  match=' + match + ' | mismatch=' + mismatch +
            ' | lost(ADO has, SN blank)=' + lost + ' | phantom(SN has, ADO blank)=' + phantom +
            ' | both-blank=' + bothBlank + ' | ado-deleted=' + adoMissing);
        if (sMis.length) gs.info(this.LOG_PREFIX + '  mismatch sample: ' + sMis.join(' | '));
        if (sLost.length) gs.info(this.LOG_PREFIX + '  lost sample: ' + sLost.join(' | '));
        if (sPhantom.length) gs.info(this.LOG_PREFIX + '  phantom sample: ' + sPhantom.join(' | '));
        return { match: match, mismatch: mismatch, lost: lost, phantom: phantom, bothBlank: bothBlank };
    },

    /**
     * UAT Defect 1 validation. Takes every SN no-points story in the exact area
     * and splits it into "live in ADO" vs "deleted in ADO" (present in the ADO
     * Recycle Bin). If SN no-points = ADO-live + deleted-in-ADO, the count
     * mismatch is fully explained by ADO deletions that didn't propagate to SN.
     *
     *   new ADOReconciliationUtil().validateNoPoints(
     *     'ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation');
     *
     * Expect: live ~= the ADO query count (e.g. 57); deleted-in-ADO = the gap.
     */
    validateNoPoints: function(project, areaPath) {
        var recycle = this._getRecycleBinIds(project);

        var refToExt = {}, refs = [];
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.query();
        while (e.next()) {
            if ((e.getDisplayValue(this.EXT_AREA_FIELD) || '') !== areaPath)
                continue; // exact area only
            refToExt[e.getValue('reference_value')] = e.getValue(this.EXT_ID_FIELD);
            refs.push(e.getValue('reference_value'));
        }

        var total = 0, live = 0, deleted = [];
        for (var i = 0; i < refs.length; i += 500) {
            var g = new GlideRecord('rm_story');
            g.addQuery('sys_id', 'IN', refs.slice(i, i + 500).join(','));
            g.addNullQuery('story_points'); // no story points
            g.query();
            while (g.next()) {
                total++;
                var ext = refToExt[g.getUniqueValue()];
                if (recycle[ext])
                    deleted.push(ext + '=' + g.getValue('number'));
                else
                    live++;
            }
        }

        gs.info(this.LOG_PREFIX + 'validateNoPoints (' + areaPath + '):');
        gs.info(this.LOG_PREFIX + '  SN no-points=' + total +
            ' | live (not deleted in ADO)=' + live +
            ' | deleted-in-ADO (orphans)=' + deleted.length);
        if (deleted.length)
            gs.info(this.LOG_PREFIX + '  deleted-in-ADO no-points: ' + deleted.join(', '));
        return { snNoPoints: total, live: live, deletedInAdo: deleted.length };
    },

    /**
     * UAT Defect 5 - backfill the Project reference on stories that imported
     * without it. The field map (System.AreaPath -> project) only resolves the
     * area-leaf to a pm_project at sync time, so stories synced before the
     * project record existed (or whose area leaf didn't name-match) stay blank.
     *
     * Deterministic: you pass the area path and the target project NUMBER, and
     * every story in that area with an EMPTY project is set to it. Already-set
     * stories are left alone.
     *
     *   // dry run (no writes) - see how many would change:
     *   new ADOReconciliationUtil().backfillProject(
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation',
     *     'PRJ0010017', false, true);
     *   // commit:
     *   new ADOReconciliationUtil().backfillProject(
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation',
     *     'PRJ0010017', false, false);
     *
     * @param areaPath        ADO area path (exact, unless includeSubAreas)
     * @param projectNumber   pm_project number, e.g. 'PRJ0010017'
     * @param includeSubAreas true = area + sub-areas (UNDER); false = this area only
     * @param dryRun          true = log only, no writes
     */
    backfillProject: function(areaPath, projectNumber, includeSubAreas, dryRun) {
        var p = new GlideRecord('pm_project');
        if (!p.get('number', projectNumber)) {
            gs.error(this.LOG_PREFIX + 'pm_project ' + projectNumber + ' not found.');
            return null;
        }
        var projSysId = p.getUniqueValue();
        var projName = p.getDisplayValue();

        var result = { scanned: 0, alreadySet: 0, updated: 0, missingStory: 0 };
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.query();
        while (e.next()) {
            var area = e.getDisplayValue(this.EXT_AREA_FIELD) || '';
            var hit = includeSubAreas ? (area.indexOf(areaPath) === 0) : (area === areaPath);
            if (!hit)
                continue;

            result.scanned++;
            var story = new GlideRecord('rm_story');
            if (!story.get(e.getValue('reference_value'))) {
                result.missingStory++;
                continue;
            }
            if (!gs.nil(story.getValue('project'))) {
                result.alreadySet++;
                continue;
            }
            if (!dryRun) {
                story.setValue('project', projSysId);
                story.setWorkflow(false);   // don't echo back to ADO / fire BRs
                story.autoSysFields(false);
                story.update();
            }
            result.updated++;
        }

        gs.info(this.LOG_PREFIX + 'backfillProject -> ' + projName +
            (dryRun ? ' (DRY RUN) ' : ' ') + JSON.stringify(result));
        return result;
    },

    /**
     * UAT follow-up: ADO deletions aren't reflected in SN. When a work item is
     * deleted in ADO it goes to the project Recycle Bin, but its SN story stays,
     * inflating counts (e.g. SN 68 vs ADO 65 = 3 deleted-in-ADO orphans).
     *
     * This reads the ADO Recycle Bin for a project and finds SN stories whose
     * ADO id is in it, then reports / cancels / deletes them.
     *
     *   // report only (default):
     *   new ADOReconciliationUtil().handleDeleted('ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation');
     *   // delete the SN orphans (dry run first!):
     *   new ADOReconciliationUtil().handleDeleted('ITS - Landing Zone Remediation',
     *     null, 'delete', true);
     *
     * @param project   ADO project whose Recycle Bin to read (required)
     * @param areaPath  optional - limit SN scope to this area (UNDER)
     * @param action    'report' (default) | 'delete'
     * @param dryRun    true = log only (for 'delete')
     */
    handleDeleted: function(project, areaPath, action, dryRun) {
        action = action || 'report';
        var deleted = this._getRecycleBinIds(project);
        var delCount = 0;
        for (var d in deleted) { if (deleted.hasOwnProperty(d)) delCount++; }
        if (delCount === 0) {
            gs.info(this.LOG_PREFIX + 'Recycle Bin empty or unreadable for ' + project + '; nothing to do.');
            return null;
        }

        var result = { scanned: 0, orphansInSn: 0, deletedSn: 0, sample: [] };
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.query();
        while (e.next()) {
            if (areaPath) {
                var a = e.getDisplayValue(this.EXT_AREA_FIELD) || '';
                if (a.indexOf(areaPath) !== 0) continue;
            }
            result.scanned++;
            var extId = e.getValue(this.EXT_ID_FIELD);
            if (!deleted[extId]) continue;

            result.orphansInSn++;
            var story = new GlideRecord('rm_story');
            if (!story.get(e.getValue('reference_value'))) continue;
            if (result.sample.length < 40)
                result.sample.push(extId + '=' + story.getValue('number'));

            if (action === 'delete' && !dryRun) {
                story.setWorkflow(false);
                story.deleteRecord();
                // also remove the now-dangling external-id link row
                e.deleteRecord();
                result.deletedSn++;
            }
        }

        gs.info(this.LOG_PREFIX + 'handleDeleted (' + project + ', action=' + action +
            (dryRun ? ', DRY RUN' : '') + '): ' + JSON.stringify({
                recycleBin: delCount, scanned: result.scanned,
                orphansInSn: result.orphansInSn, deletedSn: result.deletedSn
            }));
        if (result.sample.length)
            gs.info(this.LOG_PREFIX + 'orphan sample: ' + result.sample.join(', '));
        return result;
    },

    /**
     * Delete the SN story for ONE ADO work item id (+ its external-id link row).
     * For the real-time path: when ADO fires `workitem.deleted`, the subflow
     * calls this with the deleted ADO id and the SN record is removed.
     * Returns true if a story was deleted.
     *
     *   new ADOReconciliationUtil().deleteByAdoId(251195);
     */
    deleteByAdoId: function(adoId) {
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.addQuery(this.EXT_ID_FIELD, String(adoId));
        e.query();
        if (!e.next()) {
            gs.info(this.LOG_PREFIX + 'deleteByAdoId: no SN story linked to ADO ' + adoId);
            return false;
        }
        var num = '';
        var story = new GlideRecord('rm_story');
        if (story.get(e.getValue('reference_value'))) {
            num = story.getValue('number');
            story.setWorkflow(false); // no echo back to ADO
            story.deleteRecord();
        }
        e.deleteRecord(); // remove the dangling link row
        gs.info(this.LOG_PREFIX + 'deleteByAdoId: deleted ADO ' + adoId + ' (SN ' + num + ')');
        return true;
    },

    /**
     * One-call reconciliation sweep for a scheduled job. Runs the area-drift
     * resync (clearProject) and the deleted-orphan cleanup (delete) for an area,
     * and logs a combined summary. Point a weekly Scheduled Script Execution at:
     *
     *   new ADOReconciliationUtil().scheduledSweep(
     *     'ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation');
     *
     * Both actions are idempotent-safe to re-run. Pass dryRun=true to preview.
     */
    scheduledSweep: function(project, areaPath, dryRun) {
        var commit = (dryRun !== true);
        gs.info(this.LOG_PREFIX + 'Scheduled sweep START (' + areaPath + ')' +
            (commit ? '' : ' [DRY RUN]'));
        var drift = this.resyncArea(project, areaPath, 'clearProject', !commit);
        var deletes = this.handleDeleted(project, areaPath, 'delete', !commit);
        gs.info(this.LOG_PREFIX + 'Scheduled sweep DONE. drift=' + JSON.stringify(drift) +
            ' deletes=' + JSON.stringify(deletes));
        return { drift: drift, deletes: deletes };
    },

    /**
     * UAT Defects 3/5/8 - populate Sprint & Release on stories from the ADO
     * IterationPath. ADO encodes Release + Sprint in the iteration path
     * (Project\Release\Sprint). The OOTB integration mirrors the iteration nodes
     * into sn_ado_int_iteration but never creates rm_sprint, links
     * rm_release_scrum, or sets rm_story.sprint / rm_story.release. This does.
     *
     * Per story it reads the ADO iteration from the external-id row's
     * ado_iteration link, parses the path, resolves the release (existing
     * rm_release_scrum by name; created when opts.createReleases) and the sprint
     * (rm_sprint under that release, created if missing), then sets the story's
     * release and sprint fields.
     *
     *   // dry run across the area (default):
     *   new ADOReconciliationUtil().syncIterations(
     *     'ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation', { dryRun: true });
     *   // commit one release at a time, creating missing releases/sprints:
     *   new ADOReconciliationUtil().syncIterations('ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation',
     *     { dryRun:false, createReleases:true, releaseLeaf:'Release 1 HHS' });
     *
     * @param project   ADO project (used to normalize the release-name prefix)
     * @param areaPath  SN-tagged area to scope stories (ado_area starts with this)
     * @param opts      { dryRun:true, createReleases:false, releaseLeaf:null, limit:0 }
     * @return counts { stories, releasesMatched, releasesCreated, sprintsCreated,
     *                  storiesLinked, missingRelease, skippedNoIter, misses:{} }
     */
    syncIterations: function(project, areaPath, opts) {
        opts = opts || {};
        var dryRun = (opts.dryRun !== false);         // default DRY RUN for safety
        var createReleases = (opts.createReleases === true);
        var onlyLeaf = opts.releaseLeaf || null;      // restrict to one release leaf
        var limit = opts.limit || 0;                  // cap stories processed (0 = all)
        var doSprints = (opts.linkSprints === true);  // OFF by default: see note below
        var SEP = '\\';
        var self = this;
        // NOTE (Defect 5): sprint linking requires the Agile 2.0 iteration framework
        // (sn_apw_advanced_eap_iteration + teams/cadence) to be configured. On an
        // instance where it is not, rm_sprint inserts are aborted by the
        // "Check sprint fields correctly filled in" rule, so leave linkSprints off
        // and only release-link. See docs/iteration-sync-design.md.

        gs.info(this.LOG_PREFIX + 'syncIterations START area=' + areaPath +
            (dryRun ? ' [DRY RUN]' : ' [COMMIT]') +
            (createReleases ? ' +createReleases' : '') +
            (onlyLeaf ? ' releaseLeaf=' + onlyLeaf : ''));

        var counts = { stories: 0, releasesMatched: 0, releasesCreated: 0,
            sprintsCreated: 0, storiesLinked: 0, missingRelease: 0,
            skippedNoIter: 0, misses: {} };

        // ADO "ITS - Landing Zone Remediation" -> SN prefix "ITS Landing Zone Remediation"
        function norm(s) { return (s || '').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
        var projNorm = norm(project);

        // 1. iteration map: sys_id -> path
        var iterPath = {};
        var it = new GlideRecord('sn_ado_int_iteration');
        it.query();
        while (it.next()) { iterPath[it.getUniqueValue()] = it.getValue('path') || ''; }

        // 2. release index: leafKey -> [ {id, name, team} ]
        var relIndex = {};
        var rel = new GlideRecord('rm_release_scrum');
        rel.query();
        while (rel.next()) {
            var sd = rel.getValue('short_description') || '';
            var leaf = sd.split(' - ').pop().trim();
            (relIndex[leaf] = relIndex[leaf] || []).push(
                { id: rel.getUniqueValue(), name: sd, team: rel.getValue('default_team') });
        }

        // 3. sprint index: releaseId||sprintName -> sprintId
        var sprIndex = {};
        var spr = new GlideRecord('rm_sprint');
        spr.query();
        while (spr.next()) {
            sprIndex[spr.getValue('release') + '||' + (spr.getValue('short_description') || '').trim()] =
                spr.getUniqueValue();
        }

        function resolveRelease(leaf) {
            var cands = relIndex[leaf] || [];
            var pick = null;
            if (cands.length === 1) pick = cands[0];
            else if (cands.length > 1) {
                for (var i = 0; i < cands.length; i++)
                    if (cands[i].name.indexOf(projNorm) === 0) { pick = cands[i]; break; }
                pick = pick || cands[0];
            }
            if (pick) return pick;
            if (!createReleases) { counts.misses[leaf] = (counts.misses[leaf] || 0) + 1; return null; }
            var name = (projNorm ? projNorm + ' - ' : '') + leaf;
            if (dryRun) { counts.releasesCreated++; return { id: '(dry)', name: name, team: '' }; }
            var ngr = new GlideRecord('rm_release_scrum');
            ngr.initialize();
            ngr.setValue('short_description', name);
            ngr.setValue('active', true); // rm_story.release dropdown filters active=true (Defect 8)
            var rec = { id: ngr.insert(), name: name, team: '' };
            (relIndex[leaf] = relIndex[leaf] || []).push(rec);
            counts.releasesCreated++;
            gs.info(self.LOG_PREFIX + 'created release "' + name + '" ' + rec.id);
            return rec;
        }

        function resolveSprint(releaseRec, sprintName) {
            if (!releaseRec || !sprintName) return null;
            var key = releaseRec.id + '||' + sprintName;
            if (sprIndex[key]) return sprIndex[key];
            if (dryRun) { counts.sprintsCreated++; sprIndex[key] = '(dry)'; return '(dry)'; }
            var sgr = new GlideRecord('rm_sprint');
            sgr.initialize();
            sgr.setValue('short_description', sprintName);
            sgr.setValue('release', releaseRec.id);
            if (releaseRec.team) sgr.setValue('release_team', releaseRec.team);
            var sid = sgr.insert();
            sprIndex[key] = sid;
            counts.sprintsCreated++;
            return sid;
        }

        // per-iteration resolution cache: iterSysId -> {releaseId, sprintId, leaf}
        var resolved = {};
        function resolveIter(iterId) {
            if (resolved.hasOwnProperty(iterId)) return resolved[iterId];
            var segs = (iterPath[iterId] || '').split(SEP);
            var res = { releaseId: null, sprintId: null, leaf: null };
            if (segs.length >= 2) {
                res.leaf = segs[1].trim();
                if (!onlyLeaf || onlyLeaf === res.leaf) {
                    var relRec = resolveRelease(res.leaf);
                    if (relRec) {
                        res.releaseId = relRec.id;
                        if (doSprints && segs.length >= 3) res.sprintId = resolveSprint(relRec, segs[segs.length - 1].trim());
                    }
                }
            }
            resolved[iterId] = res;
            return res;
        }

        // 4. walk stories in the area, link them
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.addNotNullQuery('ado_iteration');
        e.query();
        while (e.next()) {
            var area = e.getDisplayValue(this.EXT_AREA_FIELD) || '';
            if (areaPath && area.indexOf(areaPath) !== 0) continue;
            counts.stories++;
            var iterId = e.getValue('ado_iteration');
            var r = resolveIter(iterId);
            if (onlyLeaf && r.leaf !== onlyLeaf) continue;
            if (!r.releaseId && !r.sprintId) continue;

            if (dryRun) {
                if (r.releaseId) counts.releasesMatched++;
                counts.storiesLinked++;
                if (limit && counts.stories >= limit) break;
                continue;
            }
            var st = new GlideRecord('rm_story');
            if (!st.get(e.getValue('reference_value'))) continue;
            var changed = false;
            if (r.releaseId && r.releaseId !== '(dry)' && st.getValue('release') !== r.releaseId) {
                st.setValue('release', r.releaseId); changed = true; counts.releasesMatched++;
            }
            if (r.sprintId && r.sprintId !== '(dry)' && st.getValue('sprint') !== r.sprintId) {
                st.setValue('sprint', r.sprintId); changed = true;
            }
            if (changed) { st.setWorkflow(false); st.update(); counts.storiesLinked++; }
            if (limit && counts.stories >= limit) break;
        }

        gs.info(this.LOG_PREFIX + 'syncIterations DONE ' + JSON.stringify(counts));
        return counts;
    },

    /**
     * UAT Defect 1 - area drift sweep. The ADO service hooks are area-filtered
     * (DevOps-controlled), so when a story moves OUT of the area ADO never sends
     * the update and SN keeps a stale ado_area - inflating the area's count.
     * This re-reads each SN story's CURRENT ADO System.AreaPath and finds the
     * ones that have drifted out of the area (optionally clears their project so
     * they drop out of the area's count, or deletes them).
     *
     *   // report only (default):
     *   new ADOReconciliationUtil().resyncArea(
     *     'ITS - Landing Zone Remediation',
     *     'ITS - Landing Zone Remediation\\ITPMO - Cloud Landing Zone Remediation');
     *   // clear project on drifted stories (dry run first!):
     *   new ADOReconciliationUtil().resyncArea(..., ..., 'clearProject', true);
     *
     * @param project   ADO project (unused today; kept for signature parity)
     * @param areaPath  the SN-tagged area to audit (stories with ado_area under it)
     * @param action    'report' (default) | 'clearProject' | 'delete'
     * @param dryRun    true = log only
     */
    resyncArea: function(project, areaPath, action, dryRun) {
        action = action || 'report';

        var items = [];
        var e = new GlideRecord(this.EXT_TABLE);
        e.addQuery(this.EXT_REF_TABLE_FIELD, 'rm_story');
        e.query();
        while (e.next()) {
            if ((e.getDisplayValue(this.EXT_AREA_FIELD) || '').indexOf(areaPath) !== 0)
                continue;
            items.push({ ext: e.getValue(this.EXT_ID_FIELD), ref: e.getValue('reference_value') });
        }

        // Current ADO area for each, batched (errorPolicy omit so a deleted id
        // doesn't fail the batch).
        var token = this.util._getAccessToken(true);
        var adoArea = {}, returned = {};
        for (var i = 0; i < items.length; i += 200) {
            var ids = [];
            for (var c = i; c < Math.min(i + 200, items.length); c++)
                ids.push(parseInt(items[c].ext, 10));
            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('POST');
            r.setEndpoint(this.ADO_ORG_URL + '/_apis/wit/workitemsbatch?api-version=' + this.API_VERSION);
            r.setRequestHeader('Authorization', 'Bearer ' + token);
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestBody(JSON.stringify({ ids: ids, fields: ['System.AreaPath'], errorPolicy: 'omit' }));
            var resp = r.execute();
            if (resp.getStatusCode() != 200) {
                gs.warn(this.LOG_PREFIX + 'resyncArea batch ' + resp.getStatusCode() + ' at ' + i);
                continue;
            }
            var val = (JSON.parse(resp.getBody() || '{}').value) || [];
            for (var v = 0; v < val.length; v++) {
                var vid = String(val[v].id);
                returned[vid] = true;
                adoArea[vid] = (val[v].fields || {})['System.AreaPath'] || '';
            }
        }

        var result = { scanned: items.length, drifted: 0, acted: 0, deletedInAdo: 0 };
        var driftSample = [];
        for (var k = 0; k < items.length; k++) {
            var it = items[k];
            if (!returned[it.ext]) { result.deletedInAdo++; continue; }
            var cur = adoArea[it.ext] || '';
            // Drifted = current ADO area is no longer at or under the audited area.
            if (cur.indexOf(areaPath) === 0)
                continue;
            result.drifted++;
            if (driftSample.length < 40) driftSample.push(it.ext + ' -> "' + cur + '"');

            if ((action === 'clearProject' || action === 'delete') && !dryRun) {
                var s = new GlideRecord('rm_story');
                if (!s.get(it.ref)) continue;
                s.setWorkflow(false);
                s.autoSysFields(false);
                if (action === 'delete') {
                    s.deleteRecord();
                } else {
                    s.setValue('project', '');
                    s.update();
                }
                result.acted++;
            }
        }

        gs.info(this.LOG_PREFIX + 'resyncArea (' + areaPath + ', action=' + action +
            (dryRun ? ', DRY RUN' : '') + '): ' + JSON.stringify(result));
        if (driftSample.length)
            gs.info(this.LOG_PREFIX + 'drifted (moved out of area): ' + driftSample.join(' | '));
        return result;
    },

    /** Read the ADO project Recycle Bin; returns { deletedWorkItemId: true }. */
    _getRecycleBinIds: function(project) {
        var token = this.util._getAccessToken(true);
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(this.ADO_ORG_URL + '/' + encodeURIComponent(project) +
            '/_apis/wit/recyclebin?api-version=7.1-preview.2');
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');
        var resp = r.execute();
        var set = {};
        if (resp.getStatusCode() == 200) {
            try {
                var val = (JSON.parse(resp.getBody() || '{}').value) || [];
                for (var i = 0; i < val.length; i++) set[String(val[i].id)] = true;
                gs.info(this.LOG_PREFIX + 'Recycle Bin (' + project + '): ' + val.length + ' deleted work items.');
            } catch (ex) {
                gs.error(this.LOG_PREFIX + 'Failed to parse recyclebin: ' + ex.message);
            }
        } else {
            gs.error(this.LOG_PREFIX + 'recyclebin returned ' + resp.getStatusCode() +
                '. First 200: ' + (resp.getBody() || '').substring(0, 200));
        }
        return set;
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
    reconcile: function(project, workItemType, areaPath, exactArea, logAllMissing) {
        var table = this.TYPE_MAP[workItemType];
        if (!table) {
            gs.error(this.LOG_PREFIX + 'No SN table mapped for "' + workItemType + '"');
            return null;
        }
        // exactArea=true  -> [System.AreaPath] = areaPath (this area only)
        // exactArea=false -> [System.AreaPath] UNDER areaPath (area + sub-areas)
        var adoIds = this._getAdoIds({ project: project, type: workItemType, areaPath: areaPath, exactArea: exactArea });
        // Scope the SN side to the same area/project so BOTH sides match and
        // the orphan count is meaningful.
        var snSet = this._getSnKeySet(table, project, areaPath, exactArea);
        var label = project + (areaPath ? ' [' + areaPath + (exactArea ? ' =' : ' UNDER') + ']' : '') +
            ' / ' + workItemType;
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
            var op = opts.exactArea ? '=' : 'UNDER';
            wiql += " AND [System.AreaPath] " + op + " '" + safeArea + "'";
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
    _getSnKeySet: function(refTable, project, areaPath, exactArea) {
        var set = {};
        var gr = new GlideRecord(this.EXT_TABLE);
        gr.addQuery(this.EXT_REF_TABLE_FIELD, refTable);
        gr.query();
        while (gr.next()) {
            if (areaPath) {
                var area = gr.getDisplayValue(this.EXT_AREA_FIELD) || '';
                if (exactArea) {
                    if (area !== areaPath)
                        continue; // this exact area only
                } else if (area.indexOf(areaPath) !== 0) {
                    continue; // UNDER: the area or any sub-area
                }
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
                    'System.IterationPath', 'Microsoft.VSTS.Scheduling.StoryPoints'],
                // omit (not fail) so one deleted id doesn't 404 the whole batch.
                errorPolicy: 'omit'
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
