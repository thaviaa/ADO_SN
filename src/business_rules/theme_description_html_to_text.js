// Business Rule: "ADO-SN - Theme Description HTML to text"
// Table: scrum_theme | When: before | Insert: true | Update: true | Order: 100 | Active: true
// Condition: current.description.changes() && new ADOSNTextUtil().looksLikeHtml(current.getValue('description'))
//
// ADO sends Feature descriptions as HTML; the Feature -> Theme field map writes System.Description
// into scrum_theme.description, a plain String(4000) field, so raw tags showed on the form and long
// descriptions were cut off mid-tag. Runs before the DB write, so it sees the full value.
// (ADOThemeBackfillUtil writes with setWorkflow(false) and calls ADOSNTextUtil itself.)
(function executeRule(current, previous /*null when async*/) {
    current.setValue('description', new ADOSNTextUtil().htmlToText(current.getValue('description')));
})(current, previous);
