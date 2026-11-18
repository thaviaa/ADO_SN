// Business Rule: "ADO-SN - Sync audit fields and comments from ADO"  (one per table)
// Tables: scrum_theme, rm_epic, rm_story | When: async | Insert: true | Update: true | Order: 1000
// Condition: !current.u_ado_number.nil() && current.sys_updated_by == 'system'
//
// UAT bugs 271047 / 271048. The OOTB ADO import runs as "system" and stamps sys_created_by /
// sys_updated_by = system; Theme comments and Epic descriptions aren't imported. After each
// import/sync write (updated by "system") this pulls Created by / Updated by from ADO, and for
// Themes/Epics the description (when empty) and any new comments. ADOSNWorkItemSync writes with
// setWorkflow(false), so this rule does not re-trigger itself and nothing is sent back to ADO.
(function executeRule(current, previous /*null when async*/) {
    try {
        new ADOSNWorkItemSync().syncBySysId(current.getTableName(), current.getUniqueValue(),
            { comments: current.getTableName() !== 'rm_story' });
    } catch (e) {
        gs.error('[ADO-SN SYNC] ' + current.getTableName() + ' ' + current.getValue('number') + ': ' + e);
    }
})(current, previous);
