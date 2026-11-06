// Defect 2 retest - relate each Theme (scrum_theme) to an ADO Project (pm_project).
// Scripts - Background, global scope. DATA work (not update-set tracked) - re-run per env.
//
// Context: scrum_theme had NO project field. Betsy reported the theme "does not relate
// to any of the ADO project." Native scrum_theme has no project column, so:
//   1) A `u_project` reference field (-> pm_project, label "Project") was added to
//      scrum_theme (update set `MECK - AT - DEFECT 2 - EPIC THEMES`), placed on the
//      Scrum (pos 9) and Default form views.
//   2) A before insert/update business rule "Theme set project from parent epic"
//      (sys_script ea84628b3398d75020f072d24d5c7baf) keeps u_project in sync with the
//      parent Epic's project GOING FORWARD:
//          var pe = current.getValue('u_parent_epic');
//          if (pe) { var ep = new GlideRecord('rm_epic');
//            if (ep.get(pe)) { var proj = ep.getValue('u_project');
//              if (proj && current.getValue('u_project') != proj)
//                current.setValue('u_project', proj); } }
//   3) This one-time backfill fills u_project on EXISTING themes.
//
// Backfill strategy (two passes):
//   Pass A - parent Epic's project: scrum_theme.u_parent_epic -> rm_epic.u_project.
//            This is the authoritative source (same mapping the BR uses).
//   Pass B - area-path fallback: for themes with no parent epic (or whose epic has no
//            u_project), derive the project from the theme's ADO AreaPath by matching
//            the leading project segment to a pm_project short_description/name.
//
// Result when first run (Test, 11/06/2026): 425/495 set
//   (406 via parent epic, 19 via area fallback); 70 remained blank (no parent epic
//   and no resolvable area). Verified: THME0011124 -> "Cloud Landing Zone Remediation".

(function () {
    var DRY_RUN = true;   // <-- set false to execute

    var viaEpic = 0, viaArea = 0, blank = 0;

    // --- Pass A: parent epic's project ---
    var g = new GlideRecord('scrum_theme');
    g.addNullQuery('u_project');
    g.addNotNullQuery('u_parent_epic');
    g.query();
    while (g.next()) {
        var ep = new GlideRecord('rm_epic');
        if (ep.get(g.getValue('u_parent_epic'))) {
            var proj = ep.getValue('u_project');
            if (proj) {
                if (!DRY_RUN) {
                    g.setValue('u_project', proj);
                    g.setWorkflow(false);
                    g.update();
                }
                viaEpic++;
                continue;
            }
        }
    }

    // --- Pass B: area-path fallback (still-blank themes) ---
    // Build a lookup of pm_project by its leading area segment (short_description/name).
    var projByName = {};
    var p = new GlideRecord('pm_project');
    p.query();
    while (p.next()) {
        var sd = (p.getValue('short_description') || '').trim().toLowerCase();
        var nm = (p.getValue('name') || '').trim().toLowerCase();
        if (sd) projByName[sd] = p.getUniqueValue();
        if (nm) projByName[nm] = p.getUniqueValue();
    }

    var g2 = new GlideRecord('scrum_theme');
    g2.addNullQuery('u_project');
    g2.query();
    while (g2.next()) {
        // derive leading project segment from AreaPath-like field (name carries the
        // ADO Feature Title; the ADO AreaPath lives on the linked work item - here we
        // use the theme's own area text if present).
        var area = (g2.getValue('u_ado_area') || '').toString();
        if (!area) { blank++; continue; }
        // leading segment before the first backslash or forward slash
        var seg = area.split('\\')[0].split('/')[0].trim().toLowerCase();
        var hit = projByName[seg];
        if (hit) {
            if (!DRY_RUN) {
                g2.setValue('u_project', hit);
                g2.setWorkflow(false);
                g2.update();
            }
            viaArea++;
        } else {
            blank++;
        }
    }

    gs.info('[D2-THEME-PROJ] ' + (DRY_RUN ? 'DRY RUN ' : 'DONE ') +
            'viaEpic=' + viaEpic + ' viaArea=' + viaArea + ' stillBlank=' + blank);
})();
