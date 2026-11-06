# Defects 14/15, 16, 17 — Agile Board (Backlog sharing, Submit, Triage Board)

- **ADO work items:** 270034 (14 & 15), 270035 (16), 270036 (17)
- **Tester:** Rakhee James · opened 11/04/2026
- **Status:** 🔎 Reproduced as the tester (impersonated Rakhee James). 16 = not a bug.
  14/15 & 17 hinge on an Agile Board **deprecation** — need a product-direction call.

## Overarching finding — the Agile Board is being deprecated

Reproduced by impersonating **Rakhee James** and opening **Agile Development > Agile
Board**. The board loads with an in-product banner:

> "Starting with the Australia release, the **Agile Board is being prepared for
> deprecation**. For details, refer to the Deprecation Process **[KB0867184]**.
> **Collaborative Work Management** is recommended for Agile teams with a modern user
> experience."

Test cases 3.0 (Agile Board) and 4.0 (Unified Backlog) were written against the full
legacy Agile Board. Several features they exercise (personal-backlog sharing, the
Triage Board) are part of that deprecating experience, which is why they don't behave
as the script expects. Evidence: `A_agile_board_DEPRECATION_banner.jpg`.

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

Observed as Rakhee: the Backlog selector lists **project/shared backlogs** (HAMP, PRJ:
BizTax Replacement, PRJ: Cloud Landing Zone, PRJ: DSS CCS) — no personal-backlog
creation flow with the **Visible to / Visible to Groups** sharing the test expects. This
is the Agile-Board personal-backlog-sharing capability that is part of the deprecating
experience.

**Needs direction:** is Meck staying on the legacy Agile Board (then this is a
setup/version gap to pursue with ServiceNow against KB0867184), or moving to
**Collaborative Work Management** (then the test case should be re-written to the modern
flow)? Not a simple config toggle.

## Defect 17 (270036) — no "Triage Board link" on the Backlog tab

Reported: the Triage Board link isn't on the right side of the Backlog tab (step 4.2,
"Create Unified Backlog").

Observed as Rakhee: the Backlog tab's right side shows only **Search** and a filter
icon — **no Triage Board link**. The Triage Board / Unified Backlog is an Agile Board
feature tied to the same deprecating experience.

**Needs direction:** same decision as 14/15 — pursue on the legacy board or move to CWM.

## Recommendation

16 can be closed as working-as-designed. 14/15 and 17 are not isolated config bugs —
they're symptoms of the **Agile Board deprecation**. Recommend a stakeholder decision:
stay on the legacy Agile Board (and raise the missing-feature items with ServiceNow via
KB0867184) **or** adopt Collaborative Work Management and update the UAT scripts to the
modern experience.

## Evidence
- `A_agile_board_DEPRECATION_banner.jpg` — Agile Board with the deprecation banner + a
  project backlog (1,249 records).
- `B_create_story_has_Save_and_Submit.jpg` — Create Story modal showing **Save + Submit**.
