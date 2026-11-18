// Client Script: "Defect 7 - Require Acceptance Criteria (...)"  (rm_story, onSubmit, Desktop)
// Defect 7 (269819) + UAT bug 271050 / STRY0010395 AC: Acceptance Criteria becomes required when
// the story moves out of Draft. acceptance_criteria is an HTML field, which the platform does not
// enforce as mandatory on submit, so this blocks the save when it's empty.
// Draft (-6) and Cancelled (4) stay optional. Form-only: the ADO integration is never blocked.
// Paired UI Policy "Require Acceptance Criteria on the Story form": condition State not in
// Draft, Cancelled; reverse if false; order 200 (runs after the OOTB "Make acceptance criteria
// mandatory", order 100, which otherwise switches mandatory off for stories without an original task).
function onSubmit() {
    var state = g_form.getValue('state');
    if (state == '-6' || state == '4') return true;
    var ac = g_form.getValue('acceptance_criteria');
    var stripped = (ac || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, '').replace(/\s/g, '');
    if (stripped === '') {
        g_form.addErrorMessage('Acceptance Criteria is required once the story moves out of Draft. Please enter it before saving.');
        g_form.showFieldMsg('acceptance_criteria', 'Acceptance Criteria is required.', 'error');
        return false;
    }
    return true;
}
