// Defect 2 (follow-up) - push scrum_theme.short_description OUT to the ADO Feature.Title.
// Scripts - Background, global scope. OUTBOUND write to ADO - run deliberately, per env.
//
// Why: the OOTB Agile integration is one-way (ADO -> SN). The inbound map
// `short_description <- System.Title` keeps SN in step with ADO. The REVERSE (SN edits
// flowing back to the ADO Feature Title) has no OOTB path, so this script does it via the
// ADO REST PATCH API, reusing the OAuth token from ADOWorkItemBackfillUtil.
//
// In practice scrum_theme.name / short_description / ADO Feature.Title are the same string
// after the inbound backfill, so this only has an effect for Features whose Title was
// genuinely edited on the SN Theme. It compares live and only PATCHes on a real difference.
//
// SAFETY: this WRITES to ADO. Keep DRY_RUN = true for the preview, review the "would push"
// list, then set DRY_RUN = false for a real run. Scopes to themes that have an ADO number
// and a non-empty short_description.
//
// ADO PATCH: PATCH {org}/_apis/wit/workitems/{id}?api-version=7.1
//   Content-Type: application/json-patch+json
//   body: [{ "op":"add", "path":"/fields/System.Title", "value": <short_description> }]

(function () {
    var DRY_RUN = true;    // <-- set false to actually write to ADO
    var LIMIT = 5000;      // safety cap per run

    var util = new ADOWorkItemBackfillUtil();
    var token = util._getAccessToken();
    if (!token) { gs.error('[D2-TITLE-OUT] no ADO token'); return; }

    var pushed = 0, skipped = 0, checked = 0, samples = [];

    function adoTitle(id) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(util.ADO_ORG_URL + '/_apis/wit/workitems/' + id +
                      '?fields=System.Title&api-version=7.1');
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        var resp = r.execute();
        if (resp.getStatusCode() != 200) return null;
        return JSON.parse(resp.getBody()).fields['System.Title'];
    }

    function pushTitle(id, title) {
        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('PATCH');
        r.setEndpoint(util.ADO_ORG_URL + '/_apis/wit/workitems/' + id + '?api-version=7.1');
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Content-Type', 'application/json-patch+json');
        r.setRequestBody(JSON.stringify([{ op: 'add', path: '/fields/System.Title', value: title }]));
        var resp = r.execute();
        return resp.getStatusCode() == 200;
    }

    var g = new GlideRecord('scrum_theme');
    g.addNotNullQuery('u_ado_number');
    g.addNotNullQuery('short_description');
    g.setLimit(LIMIT);
    g.query();
    while (g.next()) {
        checked++;
        var id = g.getValue('u_ado_number');
        var sn = g.getValue('short_description');
        var ado = adoTitle(id);
        if (ado === null) { skipped++; continue; }         // not found in ADO
        if (ado === sn) { skipped++; continue; }            // already in step - no write
        if (samples.length < 8) samples.push(g.getValue('number') + ' ' + id);
        if (!DRY_RUN) { if (pushTitle(id, sn)) pushed++; else skipped++; }
        else pushed++;
    }
    gs.info('[D2-TITLE-OUT] ' + (DRY_RUN ? 'DRY wouldPush=' : 'DONE pushed=') + pushed +
            ' checked=' + checked + ' skipped=' + skipped + ' samples=' + JSON.stringify(samples));
})();
