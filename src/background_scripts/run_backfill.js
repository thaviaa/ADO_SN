// ============================================================
//  ADO -> ServiceNow backfill runner
//  Paste into Scripts - Background (global scope).
//  Run the steps IN ORDER - do not skip to step 3.
//  Make sure your current Update Set is the ADO one, NOT Default [Global].
// ============================================================

// ---- STEP 1: auth smoke test ----
// Expect: "TEST: /projects returned HTTP 200" with real project JSON.
new ADOWorkItemBackfillUtil().testAuth();

// ---- STEP 2: comments smoke test (after step 1 shows HTTP 200) ----
// Use an ADO work item id that you KNOW has comments.
// Expect: "TEST: fetched N comment(s)" with N > 0 and the comment text.
// new ADOWorkItemBackfillUtil().testComments(268759);

// ---- STEP 3: full backfill (only after steps 1 and 2 pass) ----
// Processes up to BATCH_LIMIT (5000) candidates per run. With >5000
// candidates, run it AGAIN - processed records drop out of the candidate
// set, so the second pass picks up the remainder. Re-runs are safe
// (dedup + null guards skip already-filled records).
// var util = new ADOWorkItemBackfillUtil();
// gs.print(JSON.stringify(util.backfillAll()));
