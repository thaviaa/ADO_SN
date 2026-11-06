# Defect 2 — Epics: ADO Number field missing from form; ADO stories not linked to Epic

- **ADO work item:** 269821
- **Tester:** Betsy Kinney · opened 10/23/2026
- **Status:** ✅ RESOLVED (Test) — 11/05/2026, update set `MECK - AT - 269821 269823 - UAT DEFECT 2_4`

**Done:** story→epic linked area-wide (`rm_story.epic` = 5,497), `u_ado_number`
stamped on all 191 epics, ADO Number added to the `rm_epic` **Scrum** form view
(the Default view already had it), field map changed to `System.Parent → theme`,
and the epic business rule created. All config captured in the 2_4 update set
(Script Include, Business Rule, Field Map, Form Layout). ~712 stories have no
parent Feature in ADO and ~178 have a Feature not yet synced as a theme — those
link when the Feature syncs (field map + BR handle them going forward).
- **Expected:** The ADO Number field is on the Epic form and populated; stories
  related to the epic show on the epic page in SN.
- **Actual:** ADO Number not on the form / not populated; no ADO stories linked
  to the epic.

## Likely root cause

Two parts:
1. **Form layout** — `u_ado_number` isn't on the Epic (`rm_epic`) form.
2. **Story→Epic linking** — the Story table map uses `System.Parent → epic`, but
   a User Story's ADO **parent is usually a Feature, not an Epic**. So the link
   either resolves wrong or stays empty. Needs the hierarchy walked
   Story → Feature → Epic (or the parent mapped to the right level).

## Fix (build ready — `syncHierarchy` + `stampAdoNumbers`)

Confirmed in Test:
- Epics **are** synced as `rm_epic` (191 external-id rows); Features as
  `scrum_theme` (430). Only the **parent link** is missing in SN.
- Parent chain read live from ADO: Story `System.Parent` = Feature,
  Feature `System.Parent` = Epic (verified: 239467 → 238278 → 236403).

### Field map bug (confirmed from the rm_story Table Map, 11/04/2026)

The `rm_story` table map (`ServiceNow-Template-1.0`, Integration Type Agile) has
the row **`System.Parent → epic`**. A User Story's `System.Parent` is its
**Feature** (= Theme), not its Epic — so this row is wrong. It mostly fails to
resolve (a Feature can't fill an `rm_epic` reference), which is why so few stories
have an epic, and it will **re-apply on every sync and clobber the backfilled
`epic`**. Fix for ongoing sync (a field map is one hop; epic is two hops):
1. Change `System.Parent → epic` to **`System.Parent → theme`** (Feature→Theme).
2. Epic (the Feature's parent) needs a **business rule** on `rm_story`, not a field
   map — set `epic` from the Theme's parent Epic. (The one-time backfill below
   handles existing stories.)

**Change the field-map row before/right after running the backfill**, or the next
sync can undo the epic links.

The rest of the map is correct: `System.Id → u_ado_number`,
`Microsoft.VSTS.Common.Priority → priority`, `System.AreaPath → project`, etc.

### Backfill

`ADOReconciliationUtil.syncHierarchy(areaPath)` walks that chain and sets
`rm_story.theme` (Feature→`scrum_theme`) and `rm_story.epic` (Feature's
parent Epic→`rm_epic`). `stampAdoNumbers()` fills `u_ado_number` on the synced
themes/epics. See [`../../docs/iteration-sync-design.md`] sibling and the Script
Include. Remaining config: add `u_ado_number` to the `rm_epic` form (Defect 2)
and `scrum_theme` form (Defect 4) via Configure → Form Layout (update set
`MECK - AT - 269821 269823 - UAT DEFECT 2_4`).

## Notes
- Related to Defect 4 (Theme hierarchy) and Defect 5 (Parent→epic suspect map).

## Retest 11/06 (Betsy Kinney) — theme on the Epic + blank short_description

Betsy retested on **EPIC0010149** (ADO Epic 236748, "Ravnur Video Portal") and asked:
the Theme isn't populated, and *"there are many features associated to this one epic —
can it populate all related features? If only one, how does it pick?"*

**Hierarchy clarification.** Meck's process map (`Meck-Agile-Template-1.0.0`) maps ADO
**Epic → SN Epic** (`rm_epic`), ADO **Feature → SN Theme** (`scrum_theme`), ADO Story →
Story. So **one SN Epic = one ADO Epic with many child Features = many Themes**.
EPIC0010149 has **11** child Features/Themes (linked via `scrum_theme.u_parent_epic`).
The single `rm_epic.theme` field can hold only one (set by the Defect 4 backfill), which
is why it looked incomplete. Also, the Epic **Default view had no Theme field** (only the
Scrum/Benefit views) — if she opened it in Default view the field simply wasn't there.

**Fix (update set `MECK - AT - DEFECT 2 - EPIC THEMES`):**
- Added a **Themes related list** (`scrum_theme.u_parent_epic`) to the `rm_epic` form on the
  **Scrum** and **Default** views → shows **all** child feature-themes on the epic
  (verified: "Themes (11)" tab on EPIC0010149). This is the correct way to represent
  one-Epic-to-many-Features, and directly answers "can it show all related features?" → yes.

## Theme short_description was blank — map + backfill (11/06)

`scrum_theme.short_description` was blank on **431** of 495 themes (a mandatory/display
field). The `short_description ← System.Title` field map already exists in the active
**Meck-Agile-Template** process map (ADO Feature Title → Theme short description), so new
themes populate going forward; existing ones predated it and incremental import never
reprocessed them.
- **Backfill (DATA):** set `short_description = name` (name already holds the ADO Feature
  Title) for the 431 blank themes → **0 blank** remaining. Re-run per environment.
- **ADO direction:** the complementary ask — push `scrum_theme.short_description` **out** to
  the ADO **Feature.Title** — is the reverse of the import. The OOTB integration is one-way
  (ADO→SN), so an outbound write needs an ADO REST `PATCH` on `System.Title`
  (`ADOWorkItemBackfillUtil` already holds the auth/OAuth plumbing to extend for it). Left as
  a follow-up: in practice `name`/`short_description`/Feature.Title are the same string, so the
  values already agree after this backfill — only genuinely SN-edited titles would need the push.

## Theme not related to a Project — new field + BR + backfill (11/06)

Betsy: *"on the theme, it does not relate to any of the ADO project — we need to relate it
to project."* Native `scrum_theme` has **no project column** (unlike `rm_story`/`rm_epic`).

**Fix (update set `MECK - AT - DEFECT 2 - EPIC THEMES`):**
- Added a **`u_project`** reference field (→ `pm_project`, label **"Project"**) to
  `scrum_theme` (`sys_dictionary` `dfe32e4b3398d75020f072d24d5c7b27`); placed on the **Scrum**
  (pos 9) and **Default** form views. Verified it renders — THME0011124 shows Project =
  **"Cloud Landing Zone Remediation"**.
- Added a **before insert/update** business rule **"Theme set project from parent epic"**
  (`sys_script` `ea84628b3398d75020f072d24d5c7baf`): sets `u_project` from the parent Epic's
  `u_project` (`scrum_theme.u_parent_epic → rm_epic.u_project`) so new/updated themes stay in
  sync going forward.
- **Backfill (DATA):** `src/background_scripts/defect2_theme_project_backfill.js` — **425/495**
  set (406 via parent epic, 19 via area fallback); **70** still blank (no parent epic and no
  resolvable area path). Re-run per environment.
