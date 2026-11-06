# Defects 14/15, 16, 17 — Agile Board (Backlog sharing, Submit, Triage Board)

- **ADO work items:** 270034 (14 & 15), 270035 (16), 270036 (17)
- **Tester:** Rakhee James · opened 11/04/2026
- **Status (11/06): ✅ all resolved.** 16 = not a bug (Submit present). **14/15 & 17 fixed**
  by granting the PMs the OOTB **`scrum_product_owner`** role — the single gate for personal
  backlog create/write, triage create/write, and the Agile Board's client-side Triage Board
  link. Verified as Betsy: she created a personal backlog and the Triage Board link appeared.
  (A prior ACL-broadening attempt fixed 14/15 only — the triage link is a client-side role
  check in the deprecated board — so it was reverted in favor of the role grant.) Granted to
  Betsy Kinney, Rakhee James, Shon Kelly, Anu Urhekar, Thomas Macfarlan (Jeremy Pollard already
  had it); **Quiana Williams pending**. DATA change — replicate per env. See `VALIDATION_1-17.md`.

## TL;DR

The features 14/15/17 describe **all work in place** — the tester was using the wrong
entry point. She never created/owned a personal backlog (she was viewing **project
backlogs owned by other people**), so the sharing fields, her backlog, and the Triage
Board link never showed for her. Creating a personal backlog via **Agile Development >
Personal Backlogs > New** gives the Visible-to/Groups fields + Submit (14/15), and the
owned backlog then shows the **Triage Board** link on its Backlog tab (17). Verified by
creating a test owned backlog as admin (then deleted).

## Overarching finding — the Agile Board is being deprecated

Reproduced by impersonating **Rakhee James** and opening **Agile Development > Agile
Board**. The board loads with an in-product banner:

> "Starting with the Australia release, the **Agile Board is being prepared for
> deprecation**. For details, refer to the Deprecation Process **[KB0867184]**.
> **Collaborative Work Management** is recommended for Agile teams with a modern user
> experience."

This is **context**, not the root cause of 14/15/17 (those turned out to be entry-point
and ownership issues — see below), but it's worth noting: the board the tester used is on
a deprecation path, and a CWM migration is a sensible future roadmap item. Evidence:
`A_agile_board_DEPRECATION_banner.jpg`.

## Defect 16 (270035) — "No Submit button on Create Story" → NOT A BUG

Clicking **Create Story** on the Agile Board opens the Story modal with **both `Save`
and `Submit`** buttons (evidence: `B_create_story_has_Save_and_Submit.jpg`). So Submit
**is** present on a new story.

The test wording "Click Save, Submit" is misleading — these are **alternatives**, not a
sequence. Standard ServiceNow: **Submit** = save + close (new record only); **Save** =
save + stay, after which the button becomes **Update** (no more "Submit", because the
record now exists). The tester created **STRY0022588** by clicking Save, then looked for
Submit — which had become Update. The story is in the backlog (confirmed).

**Resolution:** working as designed. Use **Submit** on a new story, or **Save** then
**Update**. No fix needed.

## Defect 14/15 (270034) — backlog sharing / personal backlog / Submit

Reported: can't see "Visible to / Visible to Groups" fields, can't create a Personal
backlog, Backlog field doesn't show the name, no Submit button (step 3.3).

**Root cause — wrong entry point (the feature works).** The capability is present and
correctly configured:
- `backlog_definition` ("Personal backlog") has **`shared_with` ("Visible to")** and
  **`shared_with_groups` ("Visible to Groups")** fields, on both the **Default** and
  **New** form views.
- The **Personal Backlogs** module (`backlog_definition`) is open to `scrum_user`; the
  create ACL is open (admin_overrides, no role gate).
- The **"Create a new backlog"** form (Personal Backlogs > New) renders **Name, Visible
  to, Visible to Groups, Filter** and **both Save and Submit** — exactly test step 3.3.
  Evidence: `C_personal_backlog_form_visible_to_submit.jpg`.

The tester was in the **deprecated Agile Board's** backlog selector, which only lists
existing **project/shared backlogs owned by other people** — not a create-with-sharing
flow. She never created a personal backlog, so "couldn't see the sharing fields / couldn't
create a personal backlog" followed.

**Resolution (fix in place):** create personal backlogs via **Agile Development > Personal
Backlogs > New** (not the Agile Board's embedded flow). No config change needed.

## Defect 17 (270036) — no "Triage Board link" on the Backlog tab

Reported: the Triage Board link isn't on the right side of the Backlog tab (step 4.2,
"Create Unified Backlog").

**Root cause — the Triage Board link only shows on a backlog you OWN.** The test's own
precondition is *"Ensure you are the Backlog tab of a backlog **you own**."*

Rakhee owns **zero** personal backlogs — she was viewing project backlogs owned by others
(e.g. "PRJ: BizTax Replacement" is owned by **Valerie Thomas**). On a backlog she doesn't
own, there are no owner controls, so no **Triage Board** link.

Verified by creating a test personal backlog owned by admin and opening it in the Agile
Board: the **Triage Board** link appears (top-right of the Backlog panel), along with the
add/edit controls — none of which showed on the not-owned backlog. Evidence:
`D_owned_backlog_shows_triage_board_link.jpg` (test backlog since deleted). The
`triage_definition` table and create ACL are fine (open); no property/plugin gate.

**Resolution (fix in place):** the Triage Board works — it requires an **owned** backlog.
Create one via Personal Backlogs > New. See also the owner-alignment note below.

## Related improvement — align project-backlog owners to the Project Manager

Project backlogs are owned by whoever created them, not the project's PM, so PMs don't get
owner controls (Triage Board, edit, sharing) on their own project's backlog. Example:
**Rakhee James is the PM of BizTax Replacement**, but Valerie Thomas owns that backlog.
**Done (Test, 11/05).** `src/background_scripts/align_project_backlog_owner_to_pm.js` set
`backlog_definition.owner = pm_project.project_manager` (mapped via the backlog's `filter`
→ `project=<sysid>`): **10 changed**, 3 skipped (2 already PM, 1 no PM). Each former owner
was added to `shared_with` ("Visible to") so nobody lost access. Verified: all 12 project
backlogs with a PM now have owner = PM; BizTax is now owned by **Rakhee James** (Valerie
Thomas retained in Visible to) — so the PM now gets the Triage Board + edit controls on
their own project backlog. DATA change (not update-set tracked) — re-run per environment.

## Recommendation

All four resolve **in place** — none require touching the deprecated board or a CWM
migration now. 16 = working as designed. 14/15 & 17 = use the correct entry point
(Personal Backlogs > New; own the backlog). The Agile Board **deprecation** (KB0867184) is
still worth putting on a future roadmap, but it is **not** required to close these.

## Evidence
- `A_agile_board_DEPRECATION_banner.jpg` — Agile Board with the deprecation banner.
- `B_create_story_has_Save_and_Submit.jpg` — Create Story modal showing **Save + Submit** (16).
- `C_personal_backlog_form_visible_to_submit.jpg` — "Create a new backlog" form with
  Visible to / Visible to Groups + Submit (14/15).
- `D_owned_backlog_shows_triage_board_link.jpg` — an **owned** backlog showing the
  **Triage Board** link + edit controls (17).
