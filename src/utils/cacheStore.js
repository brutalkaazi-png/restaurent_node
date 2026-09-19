// Minimal stand-in for Laravel's Cache::has()/put()/forget(), used only for
// the short-lived payment lock keys in TableMenuController.
// NOTE: this is in-process memory only - fine for a single Node process in
// dev, but swap for Redis (e.g. `ioredis`) before running more than one
// instance in production, same as you'd need Laravel's redis/file cache
// driver to be shared across workers.

const store = new Map();

function has(key) {
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return false;
  }
  return true;
}

function put(key, value, ttlSeconds) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function forget(key) {
  store.delete(key);
}

module.exports = { has, put, forget };
