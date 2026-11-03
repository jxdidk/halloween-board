// db.js - SQLite Database Initialization & Repository
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'halloween_board.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let useNativeSqlite = false;

// Attempt to load Node.js native SQLite (Node 22.5+)
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  useNativeSqlite = true;
  console.log(`[DB] Connected using Node native node:sqlite at ${DB_PATH}`);
} catch (err) {
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    console.log(`[DB] Connected using better-sqlite3 at ${DB_PATH}`);
  } catch (err2) {
    console.warn(`[DB] SQLite driver not found; utilizing lightweight JSON store fallback.`);
  }
}

// Initialize tables if using SQLite
if (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS failed_attempts (
      ip TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      last_attempt INTEGER NOT NULL,
      locked_until INTEGER NOT NULL
    );
  `);

  // Check if we should insert default welcoming messages
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM messages');
  const result = countStmt.get();
  if (result && result.count === 0) {
    const initialMessages = [
      {
        content: "🎃 The veil between worlds is thin tonight. Welcome, mortals, to our haunted gathering! สุขสันต์วันฮาโลวีน 👻✨",
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        content: "🦇 A colony of bats just swept across the graveyard hill. Keep your lantern lit and tread softly.",
        created_at: new Date(Date.now() - 1800000).toISOString()
      },
      {
        content: "🔮 ยินดีต้อนรับสู่บอร์ดข้อความวันฮาโลวีน — ข้อความทั้งหมดนี้เขียนโดยเจ้าของสุสานเท่านั้น ผู้มาเยือนสามารถอ่านได้อย่างปลอดภัยใต้แสงจันทร์เต็มดวง 🌕",
        created_at: new Date().toISOString()
      }
    ];

    const insertStmt = db.prepare('INSERT INTO messages (content, created_at) VALUES (?, ?)');
    for (const msg of initialMessages) {
      insertStmt.run(msg.content, msg.created_at);
    }
    console.log('[DB] Seeded initial spooky messages.');
  }
}

// Fallback JSON-file store if environment lacks SQLite engines
const JSON_BACKUP_FILE = path.join(dataDir, 'halloween_store.json');
let fallbackStore = { messages: [], sessions: {}, failedAttempts: {} };

if (!db) {
  if (fs.existsSync(JSON_BACKUP_FILE)) {
    try {
      fallbackStore = JSON.parse(fs.readFileSync(JSON_BACKUP_FILE, 'utf8'));
    } catch (e) {
      console.error('Error loading fallback JSON store:', e);
    }
  } else {
    fallbackStore.messages = [
      {
        id: 1,
        content: "🎃 The veil between worlds is thin tonight. Welcome, mortals, to our haunted gathering! สุขสันต์วันฮาโลวีน 👻✨",
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        updated_at: null
      },
      {
        id: 2,
        content: "🦇 A colony of bats just swept across the graveyard hill. Keep your lantern lit and tread softly.",
        created_at: new Date(Date.now() - 1800000).toISOString(),
        updated_at: null
      },
      {
        id: 3,
        content: "🔮 ยินดีต้อนรับสู่บอร์ดข้อความวันฮาโลวีน — ข้อความทั้งหมดนี้เขียนโดยเจ้าของสุสานเท่านั้น 🌕",
        created_at: new Date().toISOString(),
        updated_at: null
      }
    ];
    fs.writeFileSync(JSON_BACKUP_FILE, JSON.stringify(fallbackStore, null, 2), 'utf8');
  }
}

function saveFallback() {
  if (!db) {
    fs.writeFileSync(JSON_BACKUP_FILE, JSON.stringify(fallbackStore, null, 2), 'utf8');
  }
}

// Database repository functions
const dbService = {
  // Messages
  getAllMessages() {
    if (db) {
      const stmt = db.prepare('SELECT id, content, created_at, updated_at FROM messages ORDER BY id DESC');
      return stmt.all();
    }
    return [...fallbackStore.messages].sort((a, b) => b.id - a.id);
  },

  getMessageById(id) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return null;

    if (db) {
      const stmt = db.prepare('SELECT id, content, created_at, updated_at FROM messages WHERE id = ?');
      return stmt.get(numId);
    }
    return fallbackStore.messages.find(m => m.id === numId) || null;
  },

  createMessage(content) {
    const createdAt = new Date().toISOString();
    if (db) {
      const stmt = db.prepare('INSERT INTO messages (content, created_at) VALUES (?, ?)');
      const res = stmt.run(content, createdAt);
      return {
        id: res.lastInsertRowid,
        content,
        created_at: createdAt,
        updated_at: null
      };
    }
    const nextId = (fallbackStore.messages.length > 0 ? Math.max(...fallbackStore.messages.map(m => m.id)) : 0) + 1;
    const msg = { id: nextId, content, created_at: createdAt, updated_at: null };
    fallbackStore.messages.push(msg);
    saveFallback();
    return msg;
  },

  updateMessage(id, content) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return null;
    const updatedAt = new Date().toISOString();

    if (db) {
      const stmt = db.prepare('UPDATE messages SET content = ?, updated_at = ? WHERE id = ?');
      const res = stmt.run(content, updatedAt, numId);
      if (res.changes === 0) return null;
      return this.getMessageById(numId);
    }

    const msg = fallbackStore.messages.find(m => m.id === numId);
    if (!msg) return null;
    msg.content = content;
    msg.updated_at = updatedAt;
    saveFallback();
    return msg;
  },

  deleteMessage(id) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return false;

    if (db) {
      const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
      const res = stmt.run(numId);
      return res.changes > 0;
    }

    const idx = fallbackStore.messages.findIndex(m => m.id === numId);
    if (idx === -1) return false;
    fallbackStore.messages.splice(idx, 1);
    saveFallback();
    return true;
  },

  // Sessions
  createSession(token, maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const expiresAt = now + maxAgeMs;

    if (db) {
      const stmt = db.prepare('INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)');
      stmt.run(token, now, expiresAt);
      return { token, created_at: now, expires_at: expiresAt };
    }

    fallbackStore.sessions[token] = { created_at: now, expires_at: expiresAt };
    saveFallback();
    return { token, created_at: now, expires_at: expiresAt };
  },

  getSession(token) {
    if (!token) return null;
    const now = Date.now();

    if (db) {
      const stmt = db.prepare('SELECT token, created_at, expires_at FROM sessions WHERE token = ?');
      const session = stmt.get(token);
      if (!session) return null;
      if (session.expires_at < now) {
        this.deleteSession(token);
        return null;
      }
      return session;
    }

    const session = fallbackStore.sessions[token];
    if (!session) return null;
    if (session.expires_at < now) {
      delete fallbackStore.sessions[token];
      saveFallback();
      return null;
    }
    return session;
  },

  deleteSession(token) {
    if (!token) return;
    if (db) {
      const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
      stmt.run(token);
      return;
    }
    delete fallbackStore.sessions[token];
    saveFallback();
  },

  // Failed login rate limiting
  getFailedAttempts(ip) {
    const now = Date.now();
    if (db) {
      const stmt = db.prepare('SELECT ip, attempts, last_attempt, locked_until FROM failed_attempts WHERE ip = ?');
      const record = stmt.get(ip);
      if (!record) return null;
      if (record.locked_until > 0 && record.locked_until < now && (now - record.last_attempt > 15 * 60 * 1000)) {
        this.resetFailedAttempts(ip);
        return null;
      }
      return record;
    }

    const rec = fallbackStore.failedAttempts[ip];
    if (!rec) return null;
    if (rec.locked_until > 0 && rec.locked_until < now && (now - rec.last_attempt > 15 * 60 * 1000)) {
      delete fallbackStore.failedAttempts[ip];
      saveFallback();
      return null;
    }
    return rec;
  },

  recordFailedAttempt(ip, maxAttempts = 5, lockoutDurationMs = 15 * 60 * 1000) {
    const now = Date.now();
    const existing = this.getFailedAttempts(ip);
    const newAttempts = (existing ? existing.attempts : 0) + 1;
    const lockedUntil = newAttempts >= maxAttempts ? now + lockoutDurationMs : 0;

    if (db) {
      const stmt = db.prepare(`
        INSERT INTO failed_attempts (ip, attempts, last_attempt, locked_until)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
          attempts = excluded.attempts,
          last_attempt = excluded.last_attempt,
          locked_until = excluded.locked_until
      `);
      stmt.run(ip, newAttempts, now, lockedUntil);
    } else {
      fallbackStore.failedAttempts[ip] = {
        attempts: newAttempts,
        last_attempt: now,
        locked_until: lockedUntil
      };
      saveFallback();
    }

    return { attempts: newAttempts, lockedUntil, remainingAttempts: Math.max(0, maxAttempts - newAttempts) };
  },

  resetFailedAttempts(ip) {
    if (db) {
      const stmt = db.prepare('DELETE FROM failed_attempts WHERE ip = ?');
      stmt.run(ip);
      return;
    }
    delete fallbackStore.failedAttempts[ip];
    saveFallback();
  }
};

module.exports = dbService;
