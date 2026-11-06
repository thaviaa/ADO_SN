# Defect 12 — Theme record: "no data populated" + "New opens with no association"

- **ADO work item:** 270029
- **Tester:** Rakhee James · opened 11/04/2026
- **Status:** ✅ CLOSED — validated live 11/05 (not a bug; Part 2 left OOTB by decision)

## Validation evidence (`validation/`)

Live walkthrough captured in Test + ADO:
1. `01_theme_with_data_THME0011073` — theme WITH ADO data: Name, ADO Number (238422),
   Description, and **Assigned to** (Narinder Gupta) all populated.
2. `02_defect_theme_THME0011364_blank` — the defect theme: Name/ADO Number populate,
   Description/Assigned to blank.
3. `03_ADO_feature_264461_no_description` — ADO source: Feature 264461 shows "Click to
   add Description" (empty), State *New* → the blanks are correct source data.
4. `04_theme_related_lists_epics_stories` — Epics(1)/Stories(2) related lists already
   present on the Theme form, filtered to the theme.
5. `05_new_epic_theme_readonly_product_empty` — New on the Epics list: Theme is
   read-only/blank because Product is empty (native lock) → New=blank by design.

## Part 1 — "After I selected the Theme record, none of the data got populated"

**Not a mapping bug.** The tester opened **THME0011364** = "OTC - BizTax Online"
(ADO Feature **264461**). In ADO that Feature has **no Description and no Assignee**
(state *New*). So those fields are correctly empty in SN; **Title** (Name) and **ADO
Number** *did* populate. Same false-expectation pattern as Defect 10 — the expected
data doesn't exist in the source.

Field **visibility** was addressed in **[Defect 13](../Defect%2013%20-%20Theme%20Field%20Map%20(Description%20and%20Assigned%20To)/README.md)**
(Description backfilled where ADO has one; `u_ado_assigned_to` relabeled "Assigned
to" and added to the Default form).

> Note: a tester screenshot shows the label "ADO Assigned to", but that is the
> **pre-fix** capture. Verified current state: dictionary `column_label` = "Assigned
> to" and `sys_documentation` label = "Assigned to" (global). Defect 13 relabel is
> intact.

## Part 2 — "When I click New, opens with no association to the theme I selected"

**Working as designed.** The screenshot shows a brand-new blank Theme record
(THME0011441, auto-generated Number, mandatory Name/Short description empty). Clicking
**New** on the Themes list creates a *new Theme* — it cannot be "associated to" the
previously selected theme, because **themes don't nest under themes** (a theme maps
1:1 to an ADO Feature). There is no parent-theme relationship to carry over.

### What was actually found (investigated 11/05)

The Theme form **already has** the related lists — **Epics** (`rm_epic.theme`) and
**Stories** (`rm_story.theme`) tabs render and are filtered to `Theme = <current>`,
each with a **New** button (OOTB `sys_ui_related_list` "Theme - Scrum", entries since
2012). So nothing needs adding.

Clicking **New** in the Epics related list opens a new Epic whose **Theme field is
blank and read-only** — so the child isn't associated to the theme. Root cause is
**OOTB Agile behavior**, not a Meck config gap:

- **UI Policy** (active, `rm_epic`): *"Make theme read-only if product not specified"*
  — onLoad, reverse-if-false. A brand-new epic from the related list has **no Product**,
  so Theme is forced read-only, and ServiceNow suppresses the related-list
  auto-population of a read-only reference. (`rm_story`'s equivalent policy is inactive.)
- **Write ACL** `rm_epic.theme` / `rm_story.theme`:
  `(scrum_story_creator && isNewRecord) || scrum_release_planner || scrum_admin`
  (admin_overrides). Only those roles can set Theme.

The field is not hard-locked — a manual `g_form.setValue('theme', …)` populated it fine;
the empty value is purely the read-only-on-load suppressing the auto-fill.

### Decision — leave OOTB (11/05)

No config change. The native model couples Theme to Product (pick Product → Theme
unlocks). Guidance for users: to associate an Epic/Story to a Theme, either set the
**Theme** field on the Epic/Story directly (with a `scrum_*` role), or let the **ADO
integration** set it via `System.Parent`. Creating a child from the Theme's related
list requires a Product first (then Theme unlocks).

> Considered but **not** applied: an onLoad client script on `rm_epic`/`rm_story` to
> auto-set Theme from the related-list context, or deactivating the "theme read-only if
> product empty" UI policy. Left OOTB by decision.
