# Dev migration runbook — promote Test (mecknctest) fixes down to Dev (meckncdev)

This moves the full UAT-defect fix set from **mecknctest** → **meckncdev**. It has two
parts that must both happen, in order:

1. **Config** — moved by **transferring update sets** (retrieve + preview + commit).
2. **Data** — **not** update-set tracked; the backfill scripts must be **re-run in Dev**
   against Dev's own ADO-synced records.

> ⚠️ Do **config first, then data.** Several backfills depend on fields/BRs/field-maps that
> only exist after the update sets are committed (e.g. `scrum_theme.u_project`, the
> `System.Parent → theme` field map, the Defect 4 BR).

---

## 0. Prerequisites in Dev (verify BEFORE anything)

The data scripts pull live ADO truth via `ADOWorkItemBackfillUtil._getAccessToken()`, so Dev
must already have a **working ADO connection**:

- [ ] **ADO OAuth / connection entity** exists and authenticates in Dev
      (`new ADOWorkItemBackfillUtil().testAuth();` returns OK). If Dev has never been
      connected to `dev.azure.com/meck-tfs`, this must be set up first — the backfills
      cannot run without it.
- [ ] **OOTB Agile ADO integration has run in Dev**, so `rm_story` / `rm_epic` /
      `scrum_theme` exist with **external-id rows** (the scripts match on `u_ado_number` /
      external id). If Dev has little or no synced ADO data, run the OOTB import first;
      the backfills only *correct* already-synced records.
- [ ] **Team Integration Settings** present in Dev (needed for sprint assignment going
      forward — see Defect 5 / Defect 6).

If Dev is **not** connected to ADO, stop: the config can still be migrated, but the data
backfills will no-op. Decide with the team whether Dev should get its own ADO connection or
whether only config is promoted.

---

## 1. Config — update sets to transfer (mecknctest → meckncdev)

Standard path: in Dev, **Retrieved Update Sets → Update Source** pointing at Test (or export
XML from Test and import to Dev) → **Preview** → resolve collisions → **Commit**.

Update sets authored for this work (prefix `MECK - AT -`). **Confirm the live list in Test**
(*System Update Sets → Local Update Sets*, filter name starts with `MECK - AT`) before
transfer — this list is from a 11/06 snapshot and may be incomplete/truncated:

| Update set | Covers | State |
|---|---|---|
| `MECK - AT - 269821 269823 - UAT DEFECT 2_4` | Defect 2/4: Script Include, epic BR, `System.Parent → theme` field map, `u_ado_number` form layout | complete |
| `MECK - AT - DEFECT 2 - EPIC THEMES` | Defect 2 retest: `scrum_theme.u_project` field + "set project from parent epic" BR + **Themes related list** on `rm_epic` | in progress → **complete before transfer** |
| `MECK - AT - 269821 - EPIC UAT 2` | Defect 2 epic form/map follow-ups | in progress |
| `MECK - AT - 270029 270032 - THEME UAT` | Theme form/UAT changes | in progress |
| `MECK - AT - 270028 - AGILE GROUP ROLE` | Defect 11: `Create Agile Group` module `override_menu_roles=true` | in progress |
| `MECK - AT - 270034 270036 - AGILE SELF SER` | Agile self-service | in progress |
| `MECK - AT - 269817 269818 269820 - UAT DEF` | Defect 5 form/map items | in progress |
| `MECK - AT - BUG 269819 - UAT Defect 7` | Defect 7: Acceptance Criteria | complete |
| `MECK - AT - BUG 269816 - UAT DEFECT 1` | Defect 1 | complete |
| `MECK - AT - BUG 269818 - UAT DEFECT 5` | Defect 5 form | complete |
| `MECK - AT - 265780 - SHAREPOINT LINK UI PO` | SharePoint link UI policy | complete |

**Not necessarily captured in an update set (verify / capture manually):**

- [ ] **Defect 4 — Epics related list `sys_ui_list_control`** on the Theme form
      (`omit_edit_button` / `omit_new_button`) and the **BR**
      *"Defect 4 - Set Epic Theme for native related list (ADO)"* on `rm_epic`.
- [ ] **Defect 2 — Project field position** moved under **Name** on the Theme Scrum +
      Default views (form layout).
- [ ] **Defect 5 going-forward — process-template State choice maps**
      (`sn_int_common_choice_map`). These are config but were delivered as a **script**
      (`defect5_template_state_choicemap_fix.js`), not an update set. Either run that script
      in Dev (see §2) **or** capture the corrected choice maps into an update set.

> **Before committing:** set an open update set in Dev as the current set if you want any
> manual re-config captured. **Preview every set and resolve collisions** — Dev may have
> newer/older OOTB versions of the same records.

---

## 2. Data — scripts to re-run in Dev (Scripts – Background, global scope, in order)

All live in `src/background_scripts/`. Each has `DRY_RUN = true` by default — **preview
first, read the log counts, then set `DRY_RUN = false`.** They are idempotent (match on ADO
id / only set when empty / pull ADO truth), so re-runs are safe.

| # | Script | Sets | Notes |
|---|---|---|---|
| 1 | `new ADOWorkItemBackfillUtil().testAuth();` | — | **Gate.** Must pass or stop. |
| 2 | `run_hierarchy_sync.js` (`ADOReconciliationUtil.syncHierarchy`) | `rm_story.theme`, `rm_story.epic` | Story→Feature→Epic walk (Defect 2/4). |
| 3 | `epic_project_backfill.js` → `epic_project_area_backfill.js` | `rm_epic.u_project` | Epic→Project. |
| 4 | `defect2_theme_project_backfill.js` | `scrum_theme.u_project` | Needs the `u_project` field (update set §1). |
| 5 | `defect2_theme_short_description_backfill.js` | `scrum_theme.short_description` | |
| 6 | `defect13_theme_description_backfill.js` | Theme Description/Assigned To | |
| 7 | `defect5_sprint_backfill_landingzone.js` | `rm_sprint` + `rm_story` Sprint | Landing Zone sprints. |
| 8 | releases (`ADOReconciliationUtil.syncIterations`) | `rm_story.release` | Defect 3/8. |
| 9 | **`defect5_story_state_backfill.js`** | `rm_story.state` | **Big one.** Pulls live ADO `System.State`, canonical map, `setWorkflow(false)`. Run in chunks if it nears the txn timeout. Fixes Defect 5 retest + Defect 20. |
| 10 | `defect4_native_epics_related_list.js` | `rm_epic.theme` | Per-theme Epics related list (Defect 4). |
| 11 | `align_project_backlog_owner_to_pm.js` | project/backlog owner | |
| 12 | `defect5_template_state_choicemap_fix.js` | `sn_int_common_choice_map` | **Config via script** — only if not captured as an update set. Fixes ~11 wrong-mapped templates going forward. |

**Role grants (Defect 14/15/17):** grant **`scrum_product_owner`** to the PM group/users in
Dev (Quiana Gee, Quiana Williams, etc.). Verify as one of them that the Agile board / backlog
is visible and `Create Agile Group` is hidden for Scrum Masters (Defect 11).

**Not migrated (outbound / deliberate):**
- `defect2_theme_title_push_to_ado.js` — **writes to ADO**, shared system; do not run as
  part of a Dev promotion unless intended.

---

## 3. Validation in Dev (per defect)

Re-run the retest for each: 1, 2, 2b, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14–17, 18, 19, 20
(see each defect README). Spot-checks that cover the most data:

- [ ] **D5/D20 state:** pick stories known Closed in ADO → SN = **Complete**; `rm_story`
      state distribution no longer ~82% Draft.
- [ ] **D2 epic/project:** `rm_epic.u_project` populated; a Feature's stories show an epic.
- [ ] **D2/D4 theme:** `scrum_theme.u_project`, `short_description` populated; **Themes
      related list** on an epic shows its child themes; a theme's **Epics list** shows its
      parent epic; Project field renders under Name.
- [ ] **D3/D8 release, sprint:** Landing Zone stories have Release + Sprint.
- [ ] **D11:** Scrum Master role does not see *Create Agile Group*.
- [ ] **D18:** all Landing Zone epics list when the Epics-view `active=true` filter is relaxed.

---

## Notes / cautions

- **Data is environment-specific.** The Test counts (7,106 state corrections, 425 theme
  projects, etc.) will differ in Dev depending on how much ADO data Dev has synced. Judge by
  the DRY_RUN preview counts, not the Test numbers.
- **Collisions.** Preview every update set; OOTB record versions can differ between instances.
- **Do config then data**, and keep each script's DRY_RUN preview as the go/no-go.
