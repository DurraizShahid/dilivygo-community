'use strict';

/**
 * In-memory session store — development fallback only.
 * NOT suitable for production multi-process deployments.
 */
class MemorySessionStore {
  constructor() {
    this._store = new Map();
    // Prune expired entries every 5 minutes
    setInterval(() => this._prune(), 5 * 60 * 1000).unref();
  }

  async get(id) {
    const entry = this._store.get(id);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(id);
      return null;
    }
    return entry.data;
  }

  async set(id, data, ttlSeconds) {
    this._store.set(id, {
      data,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(id) {
    this._store.delete(id);
  }

  _prune() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this._store.delete(key);
      }
    }
  }
}

module.exports = MemorySessionStore;
