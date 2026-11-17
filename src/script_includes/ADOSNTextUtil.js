// Script Include: ADOSNTextUtil (global, accessible from all application scopes)
// Converts ADO rich-text (HTML) to readable plain text for plain String fields such as
// scrum_theme.description (String, max 4000). Used by:
//   - BR "ADO-SN - Theme Description HTML to text" (imports / any interactive or integration save)
//   - ADOThemeBackfillUtil.backfillRecord (writes with setWorkflow(false), so the BR doesn't run)
//   - Fix script "ADO-SN Theme Description HTML Cleanup" (one-time cleanup of existing themes)
var ADOSNTextUtil = Class.create();
ADOSNTextUtil.prototype = {
    initialize: function () {},

    // Returns true if the value looks like HTML (has a tag or an HTML entity).
    looksLikeHtml: function (value) {
        if (gs.nil(value)) return false;
        return /<[a-z!\/][^>]*>?/i.test(String(value)) || /&(nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(String(value));
    },

    // HTML -> plain text. Keeps paragraphs/line breaks, list items as "- ", table cells
    // separated by " | ", link text with its URL, images as "[image]". maxLen (default 4000)
    // truncates with a pointer back to ADO so the DB never silently cuts mid-word.
    htmlToText: function (html, maxLen) {
        if (gs.nil(html)) return '';
        var s = String(html);
        if (!this.looksLikeHtml(s)) return s;
        maxLen = maxLen || 4000;

        s = s.replace(/\r\n?/g, '\n');
        s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<!--[\s\S]*?-->/g, '');
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<(table|ul|ol|p|div|h[1-6]|blockquote|pre)\b[^>]*>/gi, '\n');
        s = s.replace(/<li[^>]*>/gi, '\n- ');
        s = s.replace(/<\/(td|th)>/gi, ' | ');
        s = s.replace(/<\/(p|div|tr|h[1-6]|ul|ol|table|blockquote|pre)>/gi, '\n');
        s = s.replace(/<img[^>]*>/gi, '[image]');
        s = s.replace(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, function (m, href, text) {
            var t = text.replace(/<[^>]+>/g, '').trim();
            return (!t || t === href) ? href : t + ' (' + href + ')';
        });
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/<[^>]*$/, '');               // tag cut off by an earlier 4000-char truncation

        s = s.replace(/&nbsp;/gi, ' ')
             .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
             .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
             .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
             .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
             .replace(/&amp;/gi, '&');

        var lines = s.split('\n'), out = [], blank = false;
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].replace(/[ \t\u00a0]+/g, ' ').trim().replace(/\s*\|\s*$/, '').replace(/^\|\s*/, '');
            if (!l) { if (!blank && out.length) out.push(''); blank = true; continue; }
            out.push(l); blank = false;
        }
        s = out.join('\n').trim();

        if (s.length > maxLen) {
            var note = '\n... (truncated - full description in Azure DevOps)';
            s = s.substring(0, maxLen - note.length).replace(/\s+\S*$/, '') + note;
        }
        return s;
    },

    type: 'ADOSNTextUtil'
};
