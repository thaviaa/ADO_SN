# Defect 20 — Story.State in SN does not match ADO

- **ADO work item:** 270085
- **Tester:** Betsy Kinney
- **Status:** ✅ RESOLVED (Test) 11/06/2026 — same root cause/fix as Defect 5 retest 2

## Finding

Same issue as the Defect 5 2nd retest: this ADO org uses a **13-state custom User Story
model**, and stale incremental sync left ~82% of ADO-linked stories at Draft/blank in SN.

## Fix

Resolved by the **state backfill** `src/background_scripts/defect5_story_state_backfill.js`
(pulls live ADO `System.State`, applies the canonical map, `setWorkflow(false)`):
**7,106 stories corrected, 0 mismatches remaining.** Verified against ADO truth
(e.g. ADO 247735 / 265434 **Closed** → SN **Complete**).

See **Defect 5 → "Retest 2"** for the full root cause, the canonical state map, and the
going-forward template choice-map fix. **Data to re-run (Dev):** the same state backfill.
