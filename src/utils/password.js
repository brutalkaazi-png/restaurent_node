const bcrypt = require('bcryptjs');

// Laravel's bcrypt() produces hashes with the "$2y$" prefix (PHP's own
// bcrypt variant). Node's bcryptjs only recognizes "$2a$" / "$2b$", but the
// underlying algorithm is identical, so we normalize the prefix before
// comparing. This lets this app verify passwords against a users table
// that was populated by the original Laravel app.
function normalizeHash(hash) {
  if (hash && hash.startsWith('$2y$')) {
    return '$2a$' + hash.slice(4);
  }
  return hash;
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, normalizeHash(hash));
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

module.exports = { verifyPassword, hashPassword };
