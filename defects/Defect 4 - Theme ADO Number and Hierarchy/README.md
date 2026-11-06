# Defect 4 — Themes: ADO Number not populated; epics/stories not linked to Theme

- **ADO work item:** 269823
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED & VALIDATED (Test) — 11/05/2026, update set `MECK - AT - 269821 269823 - UAT DEFECT 2_4`
- **Expected (Betsy's test):** open theme THME0011011 (Cloud Landing Zone) and see
  ADO Number populated, the **epic related to the theme** shown, and the stories
  shown.
- **Actual:** No ADO number, no epic/stories — because she opened a **duplicate
  (orphan) theme** (see root cause below).

**Done:** `u_ado_number` stamped on the synced themes; `rm_story.theme` linked
area-wide (= 5,461); stories appear under the synced Theme; Theme form shows ADO
Number; **theme duplication cleaned up** (see below); **parent Epic shown via the
native "Epics" related list** (switched from the `u_parent_epic` form field on
11/05/2026 — see "Parent Epic display" below). Betsy's SUS theme (THME0011229) now
has ADO# 238256, its parent Epic **EPIC0010147** in the Epics related list, and 8
stories. All config in the 2_4 update set.

## Hierarchy model (business-confirmed)

SN model is **Epic (parent) → Theme (child) → Story (subchild)** — which *matches*
ADO (Epic → Feature → Story, with Feature = Theme). No inversion; it only differs
from ServiceNow's OOTB SPM default (Theme → Epic). So each **Theme has one parent
Epic** (its Feature's parent); each **Epic groups many Themes** (up to 72).

- ADO Epic → SN `rm_epic` · ADO Feature → SN `scrum_theme` · ADO Story → `rm_story`
- Story carries both `theme` (its Feature) and `epic` (the grandparent Epic) — done.
- **Parent Epic link:** each Theme's parent Epic is derived from the Feature's
  parent Epic (live ADO `System.Parent`). How it's *displayed* changed on
  11/05/2026 — see "Parent Epic display" below.

## Parent Epic display — native "Epics" related list (decided 11/05/2026)

**Decision:** show the parent Epic in the Theme form's native **"Epics" related
list** (driven by `rm_epic.theme`) instead of a `u_parent_epic` field on the form.

**Known limitation (accepted):** `rm_epic.theme` is single-valued and points the
OOTB direction (Theme-is-parent), but our model is Epic > Theme where one Epic
parents many Themes. Measured in Test: **406 themes with a parent epic, but only 50
distinct epics** (up to **72 themes under one epic**). So an Epic can only point
back to one Theme → populating `rm_epic.theme` leaves **~356 of 406 themes with an
empty Epics list**. The alternative (a custom "Parent Epic" related list via a
Relationship, backed by `u_parent_epic`) would cover all 406 but was **not**
chosen. To keep Betsy's re-validation theme populated, the one-time script forces
**THME0011229 → its Epic**; for other epics it picks the child theme with the most
stories.

**Implemented:**
- One-time: `rm_epic.theme` set for **50 epics** (one child theme each). Betsy's
  theme THME0011229 shows EPIC0010147. Script:
  `src/background_scripts/defect4_native_epics_related_list.js` (data, re-run per env).
- Going forward: BR **"Defect 4 - Set Epic Theme for native related list (ADO)"**
  (`src/business_rules/defect4_set_epic_theme_native.js`) sets a new theme's parent
  Epic `rm_epic.theme` **only when empty** (won't steal an Epic from a theme that
  already shows it).
- Old BR **"Set Theme Parent Epic from Feature parent (ADO)"** → **deactivated**.
- `u_parent_epic` **removed from the Theme form** (Default + Scrum views, re-saved
  via Form Layout so it captures). The column is **kept as backing data/lineage**
  for the population script; it's just no longer on the form.
- All config (BR add, old BR deactivate, both form sections) captured in the 2_4
  update set.

## Root cause — theme duplication (11/05/2026)

Betsy's THME0011011 was an **orphan duplicate**. There were **two generations of
themes** stacked on the same number range:
- **Old manual set** (~430, created May 2026 by a consultant, `scott.parry@ondarowave.com`)
  — no ADO numbers.
- **Synced set** (created Oct 12 2026 by `system`, the integration) — with ADO numbers.

The `scrum_theme` number counter (`sys_number`, prefix THME) sat at **11001**,
*behind* the max already in use, so the Oct set re-issued the same THME numbers →
**381 duplicate numbers / 762 records**, and a full duplicate set of themes.
Example: THME0011229 = "OTC - TaxRev" (May, no ADO) **and** "SUS…" (Oct, ADO 238256).

### Cleanup done (Test)
- **Deleted 324 orphan themes** — those with a synced twin (same name + ADO#), zero
  stories, zero epic references. Safe: none had children.
- **Advanced the THME number counter 11001 → 11440** (past the max 11439) so new
  themes get fresh numbers and never collide again.
- Theme count 817 → **493**; duplicate numbers 381 → **59**; Betsy's SUS theme is now
  a single record (THME0011229, ADO 238256, 8 stories).
- **Left alone:** 62 un-synced manual themes (no ADO twin).
- **Renumbered the 59 residual collisions** (old manual themes sharing a number with
  a synced one) → fresh THME numbers; **0 duplicate numbers remain**, counter at 11499.
- **Enforced uniqueness going forward:** `scrum_theme` is a standalone table (no
  inheritance), so set `scrum_theme.number` dictionary **`unique = true`** — a scoped
  unique index that blocks any future duplicate THME number. Combined with the
  advanced counter, both recurrence paths are closed. (Captured in the 2_4 update set.)

## Likely root cause

1. **ADO Number** not populated on `scrum_theme` — same pattern as Epic/Story
   (field not on form / not set from the external-id record).
2. **Hierarchy linking** — Theme sits above Epic. ADO has no native Theme.

## Business decision (received 11/04/2026)

**ADO Feature → SN Theme** (`scrum_theme`). What ADO calls a *Feature*, SN calls a
*Theme*. So a Story's Theme comes from the **Feature** it rolls up to in ADO.

Note the level offset between the tools:

```
ADO:   Epic  →  Feature  →  User Story
SN:    Theme →  Epic     →  Story
```

- ADO User Story → SN Story ✓
- ADO Feature → SN Theme (`scrum_theme`) ✓ (confirmed 11/04/2026)
- ADO Epic → SN Epic (`rm_epic`) ✓ (confirmed 11/04/2026) — the Feature's parent
  Epic sets the Story's `epic`; ties this to Defect 2.

**Full mapping is now settled — ready to build (Defects 2 + 4 as one pass).**

## Plan
- For each Story, walk the ADO parent chain: parent **Feature** → `scrum_theme`
  (Theme), that Feature's parent **Epic** → `rm_epic` (Epic).
- Create/match the `scrum_theme` records, populate `u_ado_number` on them from the
  external-id record, and set `rm_story.theme` (+ `rm_story.epic` for Defect 2).
- Build with Defect 2 (Epic linking) as one hierarchy pass.

## Notes
- Theme source is a **dependency**, not a dev task. Shares hierarchy work with
  Defect 2.

## Retest (Betsy, 11/05) failed — coverage of native Epics list (reviewed 11/06)

Betsy's 2nd retest (ADO 269823, *4. Betsy - Retest - Defect Agile Development_Themes* doc)
**failed**. Verified on 11/06: her own validation theme **THME0011229** is correct (ADO#
238256, parent Epic in the Epics list, 8 stories), but the native **"Epics" related list**
(driven by single-valued `rm_epic.theme`) shows the parent Epic on only **50 of 406** themes —
**356 themes (88%) show an empty Epics list**. So any theme Betsy opened other than the seeded
one shows no parent Epic. `u_parent_epic` is populated on all 406 (backing data).

**Decision (11/06): leave as-is (native Epics list).** Accepted that most themes won't show the
parent Epic in the related list; `u_parent_epic` remains as backing data/lineage. (Options not
taken: re-add `u_parent_epic` to the Theme form, or a custom Relationship-backed "Parent Epic"
related list — either would cover all 406.) The Epic → child-Themes direction **is** fully
covered by the **Themes related list on `rm_epic`** added under the Defect 2 retest (11/06).

## Final resolution (11/06/2026) — per-theme Epics list + inline-add

After the "leave as-is" note above, the decision was reversed to **populate the native
Epics related list per theme** (user: *"keep per theme"*). Done:

- **`rm_epic.theme` set per theme** so each theme's parent Epic shows in its native
  **Epics** related list. Confirmed on the two validation themes:
  - **THME0011124 → EPIC0010149** (ADO Feature → parent Epic 236748)
  - **THME0011225 → EPIC0010147**
  The rest were set by `src/background_scripts/defect4_native_epics_related_list.js`
  (DRY_RUN default true; picks the child theme with the most stories per epic, Betsy's
  THME0011229 forced to win for its epic). `rm_epic.theme` is single-valued, so an epic
  that parents many themes still appears under only one — accepted.
- **Inline add from the Theme form.** `sys_ui_list_control` on the Theme's Epics list set
  with **`omit_edit_button` / `omit_new_button`** tuned so a user can associate an epic to
  a theme directly from the theme (user configured the related list controls themselves —
  *"stop let me configure the related list"*). Validated: *"you should be able to add an
  epic under the theme now."*
- **Going-forward BR** `Defect 4 - Set Epic Theme for native related list (ADO)` on
  `rm_epic` keeps `rm_epic.theme` populated on new theme syncs (sets only when empty).
- **ADO bug 269823 → Resolved** (user updated it).

**Config to migrate (Dev):** the Epics-list `sys_ui_list_control` change on the Theme form
+ the going-forward BR. **Data to re-run (Dev):** `defect4_native_epics_related_list.js`.
See `DEV_MIGRATION.md`.
