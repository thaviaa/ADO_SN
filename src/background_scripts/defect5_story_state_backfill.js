// Defect 5 (retest 2) - backfill rm_story.state from the live ADO System.State.
// Scripts - Background, global scope. DATA work (not update-set tracked) - re-run per env.
//
// Tester (Betsy, 11/06): STRY0022496 <-> ADO 265434: ADO = Closed but SN = Draft.
// "The State is mapped incorrectly."
//
// ROOT CAUSE (two layers):
//   1) This ADO org uses a CUSTOM User Story state model (13 states): New, Approved,
//      Solutioning, Ready for Dev, Dev, Dev Complete, Ready for Testing, Testing,
//      Bug Fix Req, Ready for UAT, Ready for Release, Closed, Removed - NOT the default
//      New/Active/Resolved/Closed/Removed. The import's state translation is the
//      `sn_int_common_choice_map` (keyed off each process template's User Story State
//      field map). The MAIN template "Meck-Agile-Template-1.0.0" maps the custom states
//      correctly (e.g. Ready for UAT -> Complete, verified: ADO 264677 -> STRY0012673 =
//      Complete). But several OTHER templates (Procurement, Infrastructure, Strategy-EA,
//      LIB-CMS, Databases/BI, Construction, Kaizen, "Agile map", "Meck Agile Template
//      map", ...) are still wired to the DEFAULT states (Active/Resolved) this org never
//      uses - so their custom-state stories fall through to the rm_story default (Draft).
//   2) The import is incremental, so stories imported before they advanced in ADO (e.g.
//      a story that later went Closed) were never reprocessed - they sit at a stale state.
//      Before this backfill, ~82% of the 9,969 ADO-linked stories were Draft/blank.
//
// THIS SCRIPT corrects the DATA directly from ADO truth, template-independent: it pulls
// each story's current ADO System.State via the ADO REST workitemsbatch API (reusing the
// OAuth token from ADOWorkItemBackfillUtil) and sets rm_story.state via the canonical map
// below. setWorkflow(false) so the correction does NOT sync back out to ADO.
//
// Canonical ADO User Story state -> rm_story.state (grounded in the correct main-template
// choice map; the tester-endorsed reference is ADO 264677 "Ready for UAT" -> Complete):
//   New                -> -6 Draft              Testing          -> -8 Testing
//   Approved           ->  1 Ready              Bug Fix Req      ->  2 Work in progress
//   Solutioning        -> -6 Draft              Ready for UAT    ->  3 Complete
//   Ready for Dev      ->  1 Ready              Ready for Release->  3 Complete
//   Dev                ->  2 Work in progress   Closed           ->  3 Complete
//   Dev Complete       ->  2 Work in progress   Removed          ->  4 Cancelled
//   Ready for Testing  -> -7 Ready for testing  (+ QA Testing Complete->3, In UAT->3)
//
// RESULT (Test, 11/06/2026): 9,969 ADO-linked stories; 8,800 found in ADO; 7,106 corrected
//   (6,796 -> Complete, 230 -> Cancelled, 46 -> Draft, 25 -> Ready, 8 -> WIP, 1 -> Testing);
//   0 unmapped states; 1,169 not returned by ADO (removed/other project) left unchanged.
//   Verified: STRY0022496 (ADO 265434 Closed) now = Complete.
//
// NOTE: run in chunks if the server transaction nears the request timeout (the live run
// here exceeded a 45s client limit mid-pass; the pull+write is idempotent, so re-running
// only touches stories still out of sync).
//
// GOING FORWARD (separate from this data fix): align the ~11 wrong-mapped process
// templates' User Story State choice maps to the custom states (copy the correct main
// template's choice rows), so future syncs for those projects map correctly. See the
// Defect 5 README "Going forward" section.

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    var MAP = {
        'New': '-6', 'Approved': '1', 'Solutioning': '-6', 'Ready for Dev': '1',
        'Dev': '2', 'Dev Complete': '2', 'Ready for Testing': '-7', 'Testing': '-8',
        'Bug Fix Req': '2', 'Ready for UAT': '3', 'Ready for Release': '3',
        'Closed': '3', 'Removed': '4', 'QA Testing Complete': '3', 'In UAT': '3'
    };

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken();
    if (!token) { gs.error('[D5-STATE] no ADO token'); return; }

    var byId = {}, ids = [], changed = 0, adoFound = 0, unmapped = {};
    var g = new GlideRecord('rm_story');
    g.addNotNullQuery('u_ado_number');
    g.query();
    while (g.next()) {
        byId[g.getValue('u_ado_number')] = { sys: g.getUniqueValue(), st: g.getValue('state') };
        ids.push(g.getValue('u_ado_number'));
    }

    function pull(batch) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('POST');
        r.setEndpoint(util.ADO_ORG_URL + '/_apis/wit/workitemsbatch?api-version=7.1');
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Content-Type', 'application/json');
        r.setRequestBody(JSON.stringify({
            ids: batch.map(function (x) { return parseInt(x, 10); }),
            fields: ['System.Id', 'System.State']
        }));
        var resp = r.execute();
        if (resp.getStatusCode() != 200) return null;
        return JSON.parse(resp.getBody()).value;
    }

    for (var i = 0; i < ids.length; i += 200) {
        var vals = pull(ids.slice(i, i + 200));
        if (!vals) continue;
        for (var k = 0; k < vals.length; k++) {
            var id = String(vals[k].fields['System.Id']);
            var adoState = vals[k].fields['System.State'];
            var rec = byId[id];
            if (!rec) continue;
            adoFound++;
            var tgt = MAP[adoState];
            if (tgt === undefined) { unmapped[adoState] = (unmapped[adoState] || 0) + 1; continue; }
            if (rec.st !== tgt) {
                if (!DRY_RUN) {
                    var u = new GlideRecord('rm_story');
                    if (u.get(rec.sys)) { u.setValue('state', tgt); u.setWorkflow(false); u.update(); }
                }
                changed++;
            }
        }
    }
    gs.info('[D5-STATE] ' + (DRY_RUN ? 'DRY wouldChange=' : 'DONE changed=') + changed +
            ' adoFound=' + adoFound + ' unmapped=' + JSON.stringify(unmapped));
})();
