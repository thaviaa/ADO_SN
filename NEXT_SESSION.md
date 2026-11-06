# Pick up next session (14/15 & 17 permission fix)

**Status:** fix applied to Test, **NOT yet verified**. Paused 11/05 evening.

## Root cause (confirmed)
Personal backlog / triage creation is gated by the **`scrum_product_owner`** role, stored in
the `sys_security_acl_role` m2m (the ACL `roles` field reads "none", which hid this earlier):
- `backlog_definition.create` roles were `[scrum_product_owner]`
- `triage_definition.create` roles were `[scrum_admin, scrum_product_owner]`
- `triage_definition.write` roles `[scrum_product_owner, scrum_admin]` + owner condition

The PM testers (Betsy, Rakhee) have scrum_master/scrum_admin/scrum_user but **not**
scrum_product_owner → couldn't create → read-only form, no Submit (14/15) and no Triage
Board link (17).

## What was changed (update set: `MECK - AT - 270034 270036 - AGILE SELF SERVICE PERMS`, current)
- Added **`scrum_user`** to `backlog_definition.create` → now `[scrum_product_owner, scrum_user]`
- Added **`scrum_user`** to `triage_definition.create` → now `[scrum_user, scrum_admin, scrum_product_owner]`
- (no change to write ACLs; Betsy has scrum_admin which satisfies triage write)

## TODO tomorrow
1. **Verify as Betsy Kinney** (impersonate): open Agile Dev > Personal Backlogs > New →
   confirm **Save/Submit** now appear and she can create a personal backlog with Visible
   to / Visible to Groups. Then open an owned backlog → confirm the **Triage Board** link
   appears and "Set up Triage Board" works.
2. **Decision:** keep the broadened ACL (`scrum_user` = self-service for all scrum users)
   **or** instead assign `scrum_product_owner` to the specific PMs (OOTB gate). If keeping
   the ACL change, leave as-is; if not, revert the two m2m rows and grant the role instead.
3. If verified, update `VALIDATION_1-17.md` (flip 14/15 & 17 to pass) and the
   `Defect 14-17` README; note the update set to migrate per environment.
4. Clean up: the two `sys_security_acl_role` rows added are the only data changes; they're
   in the update set. ACL role changes are DATA in the m2m but the ACL records themselves
   are tracked — confirm the m2m rows captured in the update set, or re-add per environment.

## Reference records
- Betsy Kinney: Elizabeth.Kinney@mecklenburgcountync.gov (scrum_master, scrum_admin, scrum_user; not admin)
- Betsy owns backlog `be75213393624fd045f3b1266aba10df` (PRJ: Cloud Landing Zone Remediation)
- backlog_definition.create ACL: `53470c709390030064f572edb67ffbb3`
- triage_definition.create ACL: `b2e700b09390030064f572edb67ffba0`
- Sample validated story: STRY0016692 (CLZ, all fields populated)
