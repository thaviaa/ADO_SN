# Defect 4 — Themes: ADO Number not populated; epics/stories not linked to Theme

- **ADO work item:** 269823
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test, pending Betsy re-validation) — 11/05/2026, update set `MECK - AT - 269821 269823 - UAT DEFECT 2_4`
- **Expected (Betsy's test):** open theme THME0011011 (Cloud Landing Zone) and see
  ADO Number populated, the **epic related to the theme** shown, and the stories
  shown.
- **Actual:** No ADO number, no epic/stories — because she opened a **duplicate
  (orphan) theme** (see root cause below).

**Done:** `u_ado_number` stamped on the synced themes; `rm_story.theme` linked
area-wide (= 5,461); stories appear under the synced Theme; Theme form shows ADO
Number; **theme duplication cleaned up** (see below); **Parent Epic built** —
`scrum_theme.u_parent_epic` field created, **405 themes backfilled** from each
Feature's parent Epic, added to the Theme Scrum form, and an async BR keeps new
themes current. All config in the 2_4 update set (Dictionary, Field Label, Form
Layout, Business Rule, Number counter). Betsy's SUS theme (THME0011229) now has
ADO# 238256, its Parent Epic, and 8 stories. **Open:** optional renumber of the 59
residual number collisions (old un-synced manual themes).

## Hierarchy model (business-confirmed)

SN model is **Epic (parent) → Theme (child) → Story (subchild)** — which *matches*
ADO (Epic → Feature → Story, with Feature = Theme). No inversion; it only differs
from ServiceNow's OOTB SPM default (Theme → Epic). So each **Theme has one parent
Epic** (its Feature's parent); each **Epic groups many Themes** (up to 72).

- ADO Epic → SN `rm_epic` · ADO Feature → SN `scrum_theme` · ADO Story → `rm_story`
- Story carries both `theme` (its Feature) and `epic` (the grandparent Epic) — done.
- **To build:** `scrum_theme` → parent `rm_epic` link (SN's native `rm_epic.theme`
  is the reverse direction, so add a `u_parent_epic` reference on the Theme),
  backfill it from the Feature's parent Epic, show it on the Theme form, + a BR.

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
