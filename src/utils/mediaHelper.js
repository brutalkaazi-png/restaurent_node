const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ------------------------------------------------------------------ *
 * Simplified port of App\Helpers\MediaHelper::upload_image(). The
 * original stores to Laravel's `storage/app/public/{year}/{month}/{folder}`
 * and resizes anything over 1000x1000 with GD. This version:
 *   - stores to public/uploads/{year}/{month}/{folder} (served directly by
 *     express.static, no Laravel-style /storage symlink needed)
 *   - does NOT resize images - add `sharp` and resize in the multer
 *     `filename`/post-processing step if you need that back.
 * The returned path format matches what's saved in item_image /
 * category_image columns: "{year}/{month}/{folder}/{filename}".
 * ------------------------------------------------------------------ */

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');

function storageFor(destinationFolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const now = new Date();
      const dir = path.join(UPLOAD_ROOT, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), destinationFolder);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      cb(null, `${base}${ext}`);
    },
  });
}

// Returns an Express middleware for a single-file upload field, e.g.
// uploadImage('images').single('item_image')
function uploadImage(destinationFolder) {
  return multer({ storage: storageFor(destinationFolder), limits: { fileSize: 10 * 1024 * 1024 } });
}

// Given a multer `req.file`, returns the relative path to store in the DB
// column (item_image / category_image), matching the Laravel format.
function relativePathFor(file, destinationFolder) {
  if (!file) return null;
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${destinationFolder}/${file.filename}`;
}

// Public URL helper (files are served by express.static('public') in server.js).
function urlFor(relativePath) {
  if (!relativePath) return '/images/image-na.jpg';
  return `/uploads/${relativePath}`;
}

module.exports = { uploadImage, relativePathFor, urlFor };
