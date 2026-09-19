// Ported from app/Helpers/StringHelper.php's sanitize_string() usage in
// RegisterController (turns "Joe's Café" into "joes-cafe").
function sanitizeString(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

module.exports = { sanitizeString };
