# Defect 7 — New Story can be saved without Acceptance Criteria

- **ADO work item:** 269819
- **Tester:** Anu Urhekar · opened 10/26/2026
- **Status:** ⏳ OPEN (quick win)
- **Expected:** Acceptance Criteria is required; SPM shouldn't save a story without it.
- **Actual:** SPM allows saving without acceptance criteria.

## Fix (planned)

Make `acceptance_criteria` mandatory for **manual** creation **without blocking
integration inserts** (ADO stories legitimately may lack AC at import).

- **UI Policy** on `rm_story`: mandatory = true (form-only; does not affect the
  integration user's server-side inserts). Preferred.
- Optionally a **Data Policy** scoped to exclude the integration user if
  server-side enforcement is wanted.

Avoid a plain dictionary-mandatory, which would also block integration inserts.

## Effort
~0.25 day. Self-contained, no dependency.
