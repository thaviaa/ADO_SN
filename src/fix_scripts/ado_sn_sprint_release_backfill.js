// ADO-SN Sprint and Release Backfill - set rm_story.release and rm_story.sprint from the
// ADO Iteration Path (Project\Release\Sprint), for every ADO project (or one).
// Defects 3, 5, 8 / 270097. Generalises syncIterations (releases) and
// defect5_sprint_backfill_landingzone.js (sprints) to every ADO project.
// Data changes are NOT update-set tracked - run per environment, after Import Work Items.
//
// Settings (top of the IIFE):
//   DRY_RUN       true  = report only, no writes. false = commit.
//   ONLY_PROJECT  ''    = all ADO projects. Or one ADO project name, e.g. 'OTC - TaxRev'.
//   LIMIT         0     = all stories. 100 = first 100 stories per project (testing).
//   DO_RELEASES   true  = create missing rm_release_scrum (active=true) + set story.release.
//   DO_SPRINTS    true  = create missing rm_sprint shells (+ ADO external-id row) + set story.sprint.
//
// Notes:
//  - Releases are named "<ADO project, dashes normalised> - <release leaf>" (same naming as
//    syncIterations) and matched EXACTLY, so a story never lands on another project's
//    same-named release (e.g. two projects that both have "Release 1").
//  - A sprint is an iteration with no children AND at least 3 path segments
//    (Project\Release\Sprint). Project\Release leaves are releases, not sprints.
//  - Existing ADO-linked sprints are reused (matched by iteration GUID). Sprint dates come from
//    ADO best-effort. setWorkflow(false) everywhere: no outbound sync to ADO, and it avoids the
//    "Check sprint fields correctly filled in" abort on rm_sprint inserts.
//
// Suggested sequence:
//   1) DRY_RUN=true                              -> check the [ITER] counts per project
//   2) DRY_RUN=false, ONLY_PROJECT='OED - PRiSM' -> small project, eyeball a few stories
//   3) DRY_RUN=false, ONLY_PROJECT=''            -> everything
//
// ServiceNow: Fix Script "ADO-SN Sprint and Release Backfill"
// (meckncdev, update set MECK - AT - P59 ADO-SN REBUILD).

(function () {
    var DRY_RUN = true;          // false to commit
    var ONLY_PROJECT = '';       // '' = all ADO projects
    var LIMIT = 0;               // 0 = all stories; N = first N stories per project
    var DO_RELEASES = true;
    var DO_SPRINTS = true;

    function log(m) { gs.info('[ITER] ' + m); gs.print('[ITER] ' + m); }

    var util = new ADOWorkItemBackfillUtil();
    var token = DO_SPRINTS ? util._getAccessToken(true) : null;
    if (DO_SPRINTS && !token) log('WARN: no ADO token - sprints will be created without dates. Click "Get OAuth Token" on the Azure DevOps OAuth credential to include dates.');
    var org = util.ADO_ORG_URL;

    function norm(s) { return (s || '').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim(); }

    function sprintDates(projectName) {
        var out = {};
        if (!token) return out;
        try {
            var rq = new sn_ws.RESTMessageV2();
            rq.setHttpMethod('GET');
            rq.setEndpoint(org + '/' + encodeURIComponent(projectName) + '/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=7.1');
            rq.setRequestHeader('Authorization', 'Bearer ' + token);
            var rp = rq.execute();
            if (rp.getStatusCode() != 200) { log(projectName + ': iteration dates HTTP ' + rp.getStatusCode() + ' (continuing without dates)'); return out; }
            (function walk(n) {
                if (!n) return;
                if (n.identifier) { var at = n.attributes || {}; out[('' + n.identifier).toLowerCase()] = { start: at.startDate, finish: at.finishDate }; }
                var ch = n.children || [];
                for (var i = 0; i < ch.length; i++) walk(ch[i]);
            })(JSON.parse(rp.getBody()));
        } catch (ex) { log(projectName + ': iteration date fetch failed (continuing without dates): ' + ex); }
        return out;
    }

    function releaseIdFor(projectName, leaf) {
        var r = new GlideRecord('rm_release_scrum');
        r.addQuery('short_description', norm(projectName) + ' - ' + leaf);
        r.setLimit(1);
        r.query();
        return r.next() ? r.getUniqueValue() : '';
    }

    var totals = { projects: 0, storiesForRelease: 0, releasesCreated: 0, storiesReleaseSet: 0,
                   sprintsCreated: 0, sprintsExisting: 0, storiesSprintSet: 0, storiesSprintAlready: 0 };

    var pj = new GlideRecord('sn_ado_int_project');
    if (ONLY_PROJECT) pj.addQuery('name', ONLY_PROJECT);
    pj.orderBy('name');
    pj.query();
    while (pj.next()) {
        var projName = pj.getValue('name');
        var projId = pj.getUniqueValue();
        totals.projects++;

        // ---- Releases: exact "<project> - <release leaf>" match (never another project's
        //      release with the same leaf name); create missing ones active=true (Defect 8) ----
        if (DO_RELEASES) {
            var relCache = {}, relCreated = 0, relStories = 0, relSet = 0, relAlready = 0, noRelease = 0;
            var iterPath = {};
            var ip = new GlideRecord('sn_ado_int_iteration');
            ip.addQuery('ado_project', projId);
            ip.query();
            while (ip.next()) iterPath[ip.getUniqueValue()] = ip.getValue('path') || '';
            if (!Object.keys(iterPath).length) { log(projName + ' RELEASES skipped: no ADO iterations synced'); }
            var er = new GlideRecord('sn_int_common_external_identifiers');
            if (!Object.keys(iterPath).length) er.addQuery('sys_id', 'NO_ITERATIONS');
            er.addQuery('reference_table', 'rm_story');
            er.addQuery('ado_iteration', 'IN', Object.keys(iterPath).join(','));
            er.query();
            while (er.next()) {
                if (LIMIT && relStories >= LIMIT) break;
                relStories++;
                var rsegs = (iterPath[er.getValue('ado_iteration')] || '').split('\\');
                if (rsegs.length < 2) { noRelease++; continue; }      // story sits on the project root
                var leaf = rsegs[1].trim();
                if (!relCache.hasOwnProperty(leaf)) {
                    var rid = releaseIdFor(projName, leaf);
                    if (!rid) {
                        relCreated++;
                        if (DRY_RUN) rid = 'DRY';
                        else {
                            var nr = new GlideRecord('rm_release_scrum');
                            nr.initialize();
                            nr.setValue('short_description', norm(projName) + ' - ' + leaf);
                            nr.setValue('active', true);
                            nr.setWorkflow(false);
                            rid = nr.insert();
                        }
                    }
                    relCache[leaf] = rid;
                }
                var relTarget = relCache[leaf];
                var rs = new GlideRecord('rm_story');
                if (!rs.get(er.getValue('reference_value'))) continue;
                if (relTarget !== 'DRY' && rs.getValue('release') === relTarget) { relAlready++; continue; }
                if (!DRY_RUN) { rs.setValue('release', relTarget); rs.setWorkflow(false); rs.update(); }
                relSet++;
            }
            totals.storiesForRelease += relStories;
            totals.releasesCreated += relCreated;
            totals.storiesReleaseSet += relSet;
            log(projName + ' RELEASES ' + (DRY_RUN ? '[DRY] ' : '') + 'stories=' + relStories +
                ' releasesCreated=' + relCreated + ' storiesLinked=' + relSet + ' alreadyLinked=' + relAlready +
                ' onProjectRoot=' + noRelease + ' releases=' + JSON.stringify(Object.keys(relCache)));
        }

        // ---- Sprints (shell per leaf sprint iteration, then link stories) ----
        if (DO_SPRINTS) {
            var dates = sprintDates(projName);
            var sprintByIter = {}, created = 0, existed = 0;
            var it = new GlideRecord('sn_ado_int_iteration');
            it.addQuery('ado_project', projId);
            it.addQuery('has_children', 'false');
            it.query();
            while (it.next()) {
                var segs = (it.getValue('path') || '').split('\\');
                if (segs.length < 3) continue;   // Project\Release leaf = a release, not a sprint
                var guid = it.getValue('identifier');
                var iterSysId = it.getUniqueValue();
                var ex = new GlideRecord('sn_int_common_external_identifiers');
                ex.addQuery('reference_table', 'rm_sprint');
                ex.addQuery('external_id', guid);
                ex.query();
                if (ex.next()) { sprintByIter[iterSysId] = ex.getValue('reference_value'); existed++; continue; }
                if (DRY_RUN) { sprintByIter[iterSysId] = 'DRY'; created++; continue; }
                var sp = new GlideRecord('rm_sprint');
                sp.initialize();
                sp.setValue('short_description', it.getValue('name'));
                var relId = releaseIdFor(projName, segs[1].trim());
                if (relId) sp.setValue('release', relId);
                var d = dates[('' + guid).toLowerCase()];
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

            var linked = 0, already = 0, seen = 0;
            for (var iterId in sprintByIter) {
                var target = sprintByIter[iterId];
                var e = new GlideRecord('sn_int_common_external_identifiers');
                e.addQuery('reference_table', 'rm_story');
                e.addQuery('ado_iteration', iterId);
                e.query();
                while (e.next()) {
                    if (LIMIT && seen >= LIMIT) break;
                    seen++;
                    var s = new GlideRecord('rm_story');
                    if (!s.get(e.getValue('reference_value'))) continue;
                    if (target !== 'DRY' && s.getValue('sprint') === target) { already++; continue; }
                    if (!DRY_RUN) { s.setValue('sprint', target); s.setWorkflow(false); s.update(); }
                    linked++;
                }
                if (LIMIT && seen >= LIMIT) break;
            }
            totals.sprintsCreated += created;
            totals.sprintsExisting += existed;
            totals.storiesSprintSet += linked;
            totals.storiesSprintAlready += already;
            log(projName + ' SPRINTS ' + (DRY_RUN ? '[DRY] ' : '') + 'sprintsCreated=' + created +
                ' sprintsExisting=' + existed + ' storiesLinked=' + linked + ' alreadyLinked=' + already);
        }
    }

    log((DRY_RUN ? 'DRY RUN' : 'COMMIT') + ' TOTAL ' + JSON.stringify(totals));
})();
