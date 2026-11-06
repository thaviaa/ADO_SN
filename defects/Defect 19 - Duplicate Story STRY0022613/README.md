# Defect 19 — Duplicate / orphan story STRY0022613

- **ADO work item:** 270102
- **Tester:** Betsy Kinney
- **Status:** ⏸️ Flagged — left for user decision (user: *"leave the rest"*)

## Finding

**STRY0022613** carries ADO number **270073**, which **does not exist** in the ADO
`ITS - ServiceNow` project (workitem lookup returns not-found). Its content duplicates
**STRY0019149** (ADO **264526**), which is the live, correctly-linked story.

So STRY0022613 is a stale/duplicate SN record pointing at a non-existent ADO id — most
likely a manual create or an import against an id that was later removed in ADO.

## Recommendation (not executed)

Either (a) retire STRY0022613 (set state Cancelled / mark duplicate of STRY0019149), or
(b) if it should be real, create the matching ADO work item and re-point `u_ado_number`.
**Left as-is per user** — no change made in Test, nothing to migrate.
