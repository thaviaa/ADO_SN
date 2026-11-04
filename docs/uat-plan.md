# ADO → ServiceNow UAT Remediation Plan

Timeline for closing the nine UAT defects. Dates assume start-of-day **Wed, Nov 4,
2026**. See `uat-defects.md` for the full defect triage.

## Targets

| Milestone | Date |
|-----------|------|
| Dev-complete (all fixes built + unit-checked) | **Fri, Nov 20** |
| UAT retest + sign-off | **Wed, Dec 2** (buffer to Dec 4) |

**Effort:** ~10 dev-days. **Calendar:** ~3–4 weeks including UAT retest cycles.
Thanksgiving week (Nov 23–27) reduces capacity for both dev and testers, so the
sign-off target leads with **Dec 2**, not Nov 25.

## Dependencies (not dev-controlled — needed by ~Nov 13)

1. **Theme source decision** — ADO has no native Theme concept. The business must
   decide where Theme comes from (or that it's out of scope) before it can be
   built. Blocks part of Defect 5 / Defect 4.
2. **ADO `workitem.deleted` service hook** — the ADO tech is enabling it. Blocks
   the real-time half of the deletion fix.

If either slips, the completion date moves toward mid-December.

## Already done (Test env)

- **Defect 1** — resolved (Removed→Cancelled view filter; points confirmed correct)
- **Defect 5 / points** — mapping verified correct in Dev and Test
- **Defect 5 / project** — 1,256 stories backfilled (`backfillProject`)
- **ADO deletions** — 7 orphans cleared (`handleDeleted`); `deleteByAdoId` helper built

## Phases

### Phase 1 — Quick wins + replication (week of Nov 3)
- Replicate project backfill + orphan cleanup in **Dev** (and other envs) — tools built
- **Defect 7** — Acceptance Criteria required (UI/Data Policy)
- **Project resolver fix** — strip `ITPMO -` prefix so new imports populate `project`
  (stops the backfill needing to repeat)

### Phase 2 — Hierarchy + imports (week of Nov 10)
- **Defects 2 & 4** — Epic/Feature hierarchy (Story→Feature→Epic linking; `System.Parent`
  is a Feature, not an Epic)
- **Defects 6 & 9** — missing project imports (DSS-CCS, FY26 epics) — area/project routing
- **Deletion — real-time** — SN-side wiring: decision row → subflow → `deleteByAdoId`
  (starts once the ADO hook is firing)

### Phase 3 — The long pole (week of Nov 17) → dev-complete Nov 20
- **Defects 3, 5-remainder, 8** — Theme / Sprint / Release field maps + Release sync.
  Reference fields: Sprint/Release likely need the ADO **iteration sync** configured,
  not just field-map rows. Depends on the Theme-source decision above.

### Phase 4 — UAT retest + sign-off (Nov 24 – Dec 2)
- Testers retest each fix (Betsy, Anu, Quiana). Reduced capacity Thanksgiving week.
- Target sign-off **Dec 2**, buffer **Dec 4**.

## Risk notes
- The **iteration/Sprint/Release sync** is the main technical unknown — how the OOTB
  integration is (or isn't) set up for iterations. Could expand Phase 3.
- Every fix requires a **UAT retest**, so sign-off lags the build by a cycle.
- Fixes validated in Test must be **re-run/applied in Dev** (and prod) per env.
