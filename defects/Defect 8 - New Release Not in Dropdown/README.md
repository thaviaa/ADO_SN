# Defect 8 — New ADO release (Release 8) not available in SN Story Release dropdown

- **ADO work item:** 269820
- **Tester:** Betsy Kinney · opened 10/27/2026
- **Status:** ⏳ OPEN
- **Expected:** A newly created ADO release appears in the SN Story "Release" dropdown.
- **Actual:** "Release 8" isn't available.

## Likely root cause

Releases aren't synced from ADO into SN. Release lives in the ADO iteration path;
SN releases (`rm_release`) must be created by the iteration/release sync. If a new
release isn't synced, it won't appear in the reference dropdown.

## Plan
- Determine how releases are created from ADO iterations (Team Integration
  Settings / iteration discovery) and why new ones aren't picked up.
- Ensure the release layer of the sync runs (shared with Defects 3 and 5).

## Notes
- Tackle with Defect 3 (stories not under release) and Defect 5 (Release blank).
