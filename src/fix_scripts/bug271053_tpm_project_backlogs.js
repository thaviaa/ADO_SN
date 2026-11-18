// BUG 271051 / 271053 - TPMs can't see / share their project backlogs.
// Personal backlog (backlog_definition) ACLs: write/delete = scrum_product_owner AND owner is
// the current user; read = owner, "Visible to" users, or members of "Visible to Groups".
// Each ITPMO project already has a "PRJ: <project>" backlog (filter: active, unsprinted stories of
// that project) but most are owned by someone other than the project's PM (e.g. PRJ: Cloud Landing
// Zone Remediation owned by Jon Hardeman; PM Betsy Kinney), so the TPM sees it read-only or not at all.
//
// For every project with an ADO area path (pm_project.u_ado_area_path):
//   - backlog = the backlog_definition whose filter is "project=<this project>"
//     (none -> create "PRJ: <project>" with the same filter as the existing ones)
//   - owner -> the project's Project Manager; the previous owner is kept in "Visible to"
//   - "Visible to Groups" += the project's group: ADO import settings assignment group for the
//     project's ADO project, else the group most of the project's stories are assigned to
// Data change - NOT update-set tracked; run per environment.
//
// ServiceNow: Fix Script "BUG 271053 - TPM Project Backlogs"
// meckncdev: MECK - AT - BUG 271053 - TPM PROJECT BACKLOGS

(function () {
    var DRY_RUN = true;   // false to write

    function log(m) { gs.info('[BUG271053] ' + m); gs.print('[BUG271053] ' + m); }
    function addToList(list, id) {
        var a = (list || '').split(',').filter(function (x) { return x; });
        if (id && a.indexOf(id) < 0) a.push(id);
        return a.join(',');
    }
    function name(table, id) {
        var g = new GlideRecord(table);
        return id && g.get(id) ? g.getDisplayValue() : '(none)';
    }

    // ADO project name -> import settings assignment group
    var tis = {};
    var t = new GlideRecord('sn_agile_ado_int_import_settings');
    t.query();
    while (t.next()) tis[t.getDisplayValue('ado_project')] = t.getValue('assignment_group');

    var c = { projects: 0, ownerChanged: 0, groupAdded: 0, created: 0, unchanged: 0, noPM: 0, noGroup: 0 };
    var p = new GlideRecord('pm_project');
    p.addNotNullQuery('u_ado_area_path');
    p.orderBy('short_description');
    p.query();
    while (p.next()) {
        c.projects++;
        var pid = p.getUniqueValue();
        var pm = p.getValue('project_manager');
        if (!pm) { c.noPM++; log(p.number + ' ' + p.short_description + ': SKIP - no Project Manager'); continue; }

        var adoProject = (p.getValue('u_ado_area_path') || '').split('\\')[0];
        var group = tis[adoProject] || '';
        var how = 'import settings';
        if (!group) {
            var ga = new GlideAggregate('rm_story');
            ga.addQuery('project', pid);
            ga.addNotNullQuery('assignment_group');
            ga.addAggregate('COUNT');
            ga.groupBy('assignment_group');
            ga.query();
            var best = 0;
            while (ga.next()) { var n = parseInt(ga.getAggregate('COUNT'), 10); if (n > best) { best = n; group = ga.getValue('assignment_group'); } }
            how = 'stories';
        }
        if (!group) c.noGroup++;

        var b = new GlideRecord('backlog_definition');
        b.addQuery('filter', 'CONTAINS', 'project=' + pid);
        b.orderBy('sys_created_on');
        b.setLimit(1);
        b.query();
        var exists = b.next();
        var line = p.number + ' ' + p.short_description + ' | PM ' + name('sys_user', pm) +
            ' | group ' + (group ? name('sys_user_group', group) + ' (' + how + ')' : 'NONE');

        if (!exists) {
            c.created++;
            log(line + ' | CREATE "PRJ: ' + p.short_description + '"');
            if (!DRY_RUN) {
                var nb = new GlideRecord('backlog_definition');
                nb.initialize();
                nb.setValue('name', 'PRJ: ' + p.short_description);
                nb.setValue('table', 'rm_story');
                nb.setValue('filter', 'sys_class_name=rm_story^active=true^sprintISEMPTY^project=' + pid);
                nb.setValue('owner', pm);
                if (group) nb.setValue('shared_with_groups', group);
                nb.insert();
            }
            continue;
        }

        var oldOwner = b.getValue('owner');
        var changes = [];
        var sharedWith = b.getValue('shared_with') || '';
        var groups = b.getValue('shared_with_groups') || '';
        if (oldOwner !== pm) {
            changes.push('owner ' + name('sys_user', oldOwner) + ' -> ' + name('sys_user', pm) + ' (previous owner kept in Visible to)');
            sharedWith = addToList(sharedWith, oldOwner);
            c.ownerChanged++;
        }
        if (group && ('' + groups).split(',').indexOf(group) < 0) {
            changes.push('+group ' + name('sys_user_group', group));
            groups = addToList(groups, group);
            c.groupAdded++;
        }
        if (!changes.length) { c.unchanged++; log(line + ' | "' + b.getValue('name') + '" OK'); continue; }
        log(line + ' | "' + b.getValue('name') + '": ' + changes.join('; '));
        if (!DRY_RUN) {
            b.setValue('owner', pm);
            b.setValue('shared_with', sharedWith);
            b.setValue('shared_with_groups', groups);
            b.update();
        }
    }
    log((DRY_RUN ? 'DRY RUN ' : 'COMMIT ') + JSON.stringify(c));
})();
