# Status (14/15 & 17 — DONE 11/06)

**Resolved.** Root cause: the Agile 2.0 personal-backlog + triage feature set (incl. the
Agile Board's client-side **Triage Board link**) is OOTB-gated on the **`scrum_product_owner`**
role, which the Meck PM testers lacked.

**Fix applied (Test, 11/06):** granted `scrum_product_owner` to the agile project PMs.
Verified as Betsy Kinney — she created a personal backlog (editable form + Submit) and the
**Triage Board link appeared** on her owned backlog.

- Granted: **Betsy Kinney, Rakhee James, Shon Kelly, Anu Urhekar, Thomas Macfarlan**
- Already had it: **Jeremy Pollard**
- **PENDING: Quiana Williams** — her user_name didn't match the guessed pattern, and the
  fuzzy-lookup grant was blocked by the safety classifier. Grant `scrum_product_owner` to her
  via her user record (she's PM of ITS ServiceNow Operational FY26/FY27).

**Notes**
- This is a **DATA** change (role grants), not update-set tracked — replicate per environment.
- The earlier ACL-broadening (update set `MECK - AT - 270034 270036 - AGILE SELF SERVICE PERMS`)
  was **reverted** (it fixed 14/15 but not the client-side triage link); the update set is a no-op.
- Alternative not taken: broaden backlog/triage ACLs to `scrum_user` for all-scrum-user
  self-service — but the deprecated board's Triage Board link would still need `scrum_product_owner`.
