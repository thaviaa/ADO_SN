var ADOWorkItemBackfillUtil = Class.create();
ADOWorkItemBackfillUtil.prototype = {

    initialize: function() {
        // ================= CONFIG - ADJUST TO YOUR ENVIRONMENT =================
        this.ADO_ORG_URL = 'https://dev.azure.com/meck-tfs';
        this.API_VERSION = '7.1';
        // Comments live on a separate, preview-versioned resource.
        // If this 404s / returns "invalid api-version", switch to '5.0-preview.2'.
        this.COMMENTS_API_VERSION = '5.0-preview.2';
        this.OAUTH_ENTITY_NAME = 'Azure DevOps OAuth'; // exact Name of the OAuth provider (oauth_entity) record
        //this.CONNECTION_ALIAS_ID = '3dcb1f3dc79c401024f6612827c2600c';
        this.CONNECTION_ALIAS_ID = '1103c6b887ff03102bd50d47dabb35d1';
        this.TABLE = 'rm_story';
        this.ADO_ID_FIELD = 'u_ado_number';
        this.DESC_FIELD = 'html_description';
        this.AC_FIELD = 'acceptance_criteria';
        this.WORKNOTES_FIELD = 'work_notes';
        this.BATCH_LIMIT = 5000;
        this.LOG_PREFIX = '[ADOWorkItemBackfillUtil] ';
        //
        // =======================================================================

        this._cachedToken = null;
    },

    /**
     * Auth smoke test. Run this FIRST in a background script:
     *   new ADOWorkItemBackfillUtil().testAuth();
     * Makes a single lightweight ADO call and logs exactly what happened.
     */
    testAuth: function() {
        var token = this._getAccessToken(true);
        if (!token) {
            gs.info(this.LOG_PREFIX + 'TEST: No token retrieved at all. See errors above.');
            return false;
        }
        gs.info(this.LOG_PREFIX + 'TEST: Got token (length ' + token.length +
            ', starts "' + token.substring(0, 8) + '...")');

        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(this.ADO_ORG_URL + '/_apis/projects?api-version=' + this.API_VERSION);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');

        var resp = r.execute();
        var status = resp.getStatusCode();
        var body = resp.getBody() || '';
        gs.info(this.LOG_PREFIX + 'TEST: /projects returned HTTP ' + status +
            '. First 200 chars: ' + body.substring(0, 200));
        return status == 200;
    },

    /**
     * Comments smoke test. Run AFTER testAuth passes:
     *   new ADOWorkItemBackfillUtil().testComments(268759);
     * Verifies the comments endpoint + api-version before a full backfill.
     */
    testComments: function(adoId) {
        var comments = this._getWorkItemComments(adoId);
        gs.info(this.LOG_PREFIX + 'TEST: fetched ' + comments.length + ' comment(s) for ADO ' + adoId);
        for (var i = 0; i < comments.length; i++) {
            gs.info(this.LOG_PREFIX + '  rev ' + comments[i].rev + ' by ' + comments[i].by +
                ': ' + (comments[i].text || '').substring(0, 120));
        }
        return comments.length;
    },

    /**
     * Backfill all records missing description or acceptance criteria.
     *
     * NOTE ON SCOPE: this query only selects records MISSING description or AC.
     * A record that already has both will NOT be a candidate, so its comment
     * history will NOT be backfilled. If you want comments on EVERY synced
     * record regardless, comment out the two lines marked [SCOPE] below and
     * rely on addNotNullQuery(ADO_ID_FIELD) alone. (Costs one comments API
     * call per record - mind the 5000 limit and ADO rate limits.)
     */
    backfillAll: function() {
        var result = {
            processed: 0,
            updated: 0,
            skipped: 0,
            errors: 0
        };
        var gr = new GlideRecord(this.TABLE);
        gr.addNotNullQuery(this.ADO_ID_FIELD);
        var qc = gr.addNullQuery(this.DESC_FIELD); // [SCOPE]
        qc.addOrCondition(this.AC_FIELD, 'ISEMPTY'); // [SCOPE]
        gr.setLimit(this.BATCH_LIMIT);
        gr.query();

        gs.info(this.LOG_PREFIX + 'Starting backfill. Candidate records: ' + gr.getRowCount());

        while (gr.next()) {
            result.processed++;
            try {
                if (this.backfillRecord(gr))
                    result.updated++;
                else
                    result.skipped++;
            } catch (e) {
                result.errors++;
                gs.error(this.LOG_PREFIX + 'Error on ' + gr.getValue('number') +
                    ' (ADO ' + gr.getValue(this.ADO_ID_FIELD) + '): ' + e.message);
            }
        }

        gs.info(this.LOG_PREFIX + 'Done. Processed: ' + result.processed +
            ', Updated: ' + result.updated +
            ', Skipped: ' + result.skipped +
            ', Errors: ' + result.errors);
        return result;
    },

    /**
     * Backfill a single record. Returns true if updated.
     * Fields (description / AC) and comments (System.History) are both gathered,
     * then persisted in a SINGLE update so comment-only changes still save.
     */
    backfillRecord: function(gr) {
        var adoId = gr.getValue(this.ADO_ID_FIELD);
        if (gs.nil(adoId))
            return false;

        var changed = false;

        // ---- Fields: description / acceptance criteria ----
        var fields = this._getWorkItemFields(adoId);
        if (fields) {
            var desc = fields['System.Description'];
            var ac = fields['Microsoft.VSTS.Common.AcceptanceCriteria'];

            if (!gs.nil(desc) && gs.nil(gr.getValue(this.DESC_FIELD))) {
                gr.setValue(this.DESC_FIELD, desc);
                changed = true;
            }
            if (!gs.nil(ac) && gs.nil(gr.getValue(this.AC_FIELD))) {
                gr.setValue(this.AC_FIELD, ac);
                changed = true;
            }
        }

        // ---- Comments: System.History -> work_notes ----
        // Queues journal entries on gr; does NOT update (caller does it once).
        if (this._backfillComments(gr, adoId))
            changed = true;

        if (changed) {
            gr.setWorkflow(false); // don't fire business rules / echo back to ADO
            gr.autoSysFields(false);
            gr.update();
            gs.info(this.LOG_PREFIX + 'Updated ' + gr.getValue('number') + ' from ADO ' + adoId);
        }
        return changed;
    },

    backfillBySysId: function(sysId) {
        var gr = new GlideRecord(this.TABLE);
        if (!gr.get(sysId)) {
            gs.warn(this.LOG_PREFIX + 'Record not found: ' + sysId);
            return false;
        }
        return this.backfillRecord(gr);
    },

    /**
     * Pull ALL comments for a work item and queue any new ones onto gr.work_notes.
     * Does NOT call update() - the caller persists once with the field changes.
     * Returns true if at least one new comment was queued.
     *
     * Re-run safe: dedups against existing journal text so running backfill
     * twice won't double-post. Plain text (HTML stripped in _getWorkItemComments).
     */
    _backfillComments: function(gr, adoId) {
        var comments = this._getWorkItemComments(adoId);
        if (!comments || !comments.length)
            return false;

        var existing = '';
        try {
            existing = gr.getElement(this.WORKNOTES_FIELD).getJournalEntry(-1) || '';
        } catch (e) {
            existing = '';
        }

        var added = false;
        // Comments come back ascending (oldest first) via fromRevision=1; post in order.
        for (var i = 0; i < comments.length; i++) {
            var c = comments[i];
            if (gs.nil(c.text))
                continue;

            // Best-effort dedup: skip if this comment text is already in the journal.
            if (existing.indexOf(c.text) !== -1)
                continue;

            var line = (c.by ? c.by + ': ' : '') + c.text;
            //var line = '[code]' + (c.by ? c.by + ': ' : '') + c.text + '[/code]';
            gs.info(this.LOG_PREFIX + 'Queing:' + line.substring(0, 80));
            //gr.setValue(this.WORKNOTES_FIELD, line); // setValue does NOT register journal entries
            gr[this.WORKNOTES_FIELD] = line; // direct assignment queues the journal entry
            added = true;
        }
        return added;
    },

    /**
     * Fetch all comments for a work item from the ADO Comments resource.
     * Returns an array of { text, by, rev } (empty array on failure).
     * On an auth-shaped failure (203/302/401), forces a token refresh and retries ONCE.
     */
    _getWorkItemComments: function(adoId, isRetry) {
        var token = this._getAccessToken(isRetry === true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token available for comments on work item ' + adoId);
            return [];
        }

        /*var endpoint = this.ADO_ORG_URL + '/_apis/wit/workItems/' + adoId +
            '/comments?api-version=' + this.COMMENTS_API_VERSION + '&order=desc';*/

        var endpoint = this.ADO_ORG_URL + '/_apis/wit/workItems/' + adoId +
            '/comments?api-version=' + this.COMMENTS_API_VERSION + '&fromRevision=1&$top=200';

        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(endpoint);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');

        var resp = r.execute();
        var status = resp.getStatusCode();
        var body = resp.getBody() || '';
        //gs.info(this.LOG_PREFIX + 'RAW comments:' + body.substring(0, 500));

        if (status == 200) {
            try {
                var parsed = JSON.parse(body);
                // Preview endpoint returns the array under "comments" or "value"
                // depending on version - handle both.
                var list = parsed.comments || parsed.value || [];
                var out = [];
                for (var i = 0; i < list.length; i++) {
                    out.push({
                        text: (list[i].text || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(),
                        by: (list[i].revisedBy && list[i].revisedBy.displayName) || '',
                        rev: list[i].revision
                    });
                }
                return out;
            } catch (e) {
                gs.error(this.LOG_PREFIX + 'Failed to parse comments for ' + adoId + ': ' + e.message);
                return [];
            }
        }

        // Auth-shaped failure: refresh token and retry once
        if ((status == 203 || status == 302 || status == 401) && isRetry !== true) {
            gs.warn(this.LOG_PREFIX + 'HTTP ' + status + ' on comments for ' + adoId +
                ' - refreshing token and retrying once.');
            this._cachedToken = null;
            return this._getWorkItemComments(adoId, true);
        }

        gs.error(this.LOG_PREFIX + 'ADO comments API returned ' + status + ' for work item ' +
            adoId + '. First 200 chars: ' + body.substring(0, 200));
        return [];
    },

    /**
     * Call the individual work item API. On an auth-shaped failure
     * (203/302/401), force a token refresh and retry ONCE.
     */
    _getWorkItemFields: function(adoId, isRetry) {
        var token = this._getAccessToken(isRetry === true);
        if (!token) {
            gs.error(this.LOG_PREFIX + 'No access token available for work item ' + adoId);
            return null;
        }

        var endpoint = this.ADO_ORG_URL + '/_apis/wit/workitems/' + adoId +
            '?fields=System.Description,Microsoft.VSTS.Common.AcceptanceCriteria' +
            '&api-version=' + this.API_VERSION;

        var r = new sn_ws.RESTMessageV2();
        r.setHttpMethod('GET');
        r.setEndpoint(endpoint);
        r.setRequestHeader('Authorization', 'Bearer ' + token);
        r.setRequestHeader('Accept', 'application/json');

        var resp = r.execute();
        var status = resp.getStatusCode();
        var body = resp.getBody() || '';

        if (status == 200) {
            try {
                var parsed = JSON.parse(body);
                return parsed.fields || null;
            } catch (e) {
                gs.error(this.LOG_PREFIX + 'Failed to parse response for ' + adoId + ': ' + e.message);
                return null;
            }
        }

        // Auth-shaped failure: refresh token and retry once
        if ((status == 203 || status == 302 || status == 401) && isRetry !== true) {
            gs.warn(this.LOG_PREFIX + 'HTTP ' + status + ' for ' + adoId +
                ' - refreshing token and retrying once.');
            this._cachedToken = null;
            return this._getWorkItemFields(adoId, true);
        }

        gs.error(this.LOG_PREFIX + 'ADO API returned ' + status + ' for work item ' +
            adoId + '. First 200 chars: ' + body.substring(0, 200));
        return null;
    },

    /**
     * Token retrieval, two strategies:
     *   1. GlideOAuthClient refresh-token grant (always returns a LIVE token)
     *   2. Fallback: stored token from the connection alias credential
     * Pass forceRefresh=true to skip the cache.
     */
    _getAccessToken: function(forceRefresh) {
        if (this._cachedToken && forceRefresh !== true)
            return this._cachedToken;
        this._cachedToken = null;

        // Strategy 1: refresh-token grant via GlideOAuthClient
        try {
            var client = new sn_auth.GlideOAuthClient();
            var params = {
                grant_type: 'refresh_token'
            };
            var tokenResponse = client.requestToken(this.OAUTH_ENTITY_NAME, JSON.stringify(params));
            if (tokenResponse) {
                var token = tokenResponse.getToken();
                if (token && !gs.nil(token.getAccessToken())) {
                    this._cachedToken = token.getAccessToken();
                    gs.info(this.LOG_PREFIX + 'Token obtained via GlideOAuthClient refresh grant.');
                    return this._cachedToken;
                }
                gs.warn(this.LOG_PREFIX + 'GlideOAuthClient returned no token. Error: ' +
                    tokenResponse.getErrorMessage() + '. Body: ' +
                    (tokenResponse.getBody() || '').substring(0, 300));
            }
        } catch (e) {
            gs.warn(this.LOG_PREFIX + 'GlideOAuthClient attempt failed: ' + e.message);
        }

        // Strategy 2: stored token from the connection alias
        try {
            var provider = new sn_cc.ConnectionInfoProvider();
            var connectionInfo = provider.getConnectionInfo(this.CONNECTION_ALIAS_ID);
            if (connectionInfo) {
                var stored = connectionInfo.getCredentialAttribute('access_token');
                if (!gs.nil(stored)) {
                    this._cachedToken = stored;
                    gs.info(this.LOG_PREFIX + 'Token obtained from connection alias (stored; may be stale).');
                    return this._cachedToken;
                }
                gs.warn(this.LOG_PREFIX + 'Alias resolved but access_token attribute empty.');
            } else {
                gs.warn(this.LOG_PREFIX + 'No connection info for alias ' + this.CONNECTION_ALIAS_ID);
            }
        } catch (e2) {
            gs.warn(this.LOG_PREFIX + 'Alias token retrieval failed: ' + e2.message);
        }

        gs.error(this.LOG_PREFIX + 'All token retrieval strategies failed.');
        return null;
    },

    type: 'ADOWorkItemBackfillUtil'
};
