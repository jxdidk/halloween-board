// server.js - Halloween Message Board Server Entrypoint
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

const dbService = require('./db');
const { requireOwner, isOwnerAuthenticated } = require('./middleware/auth');
const {
  checkLoginRateLimit,
  onLoginFailure,
  onLoginSuccess
} = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve ADMIN_PASSWORD from environment variable
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = 'spooky-owner-pass';
  console.warn('\n⚠️ [SECURITY WARNING] ADMIN_PASSWORD environment variable is not set!');
  console.warn(`⚠️ Defaulting to temporary development password: "${ADMIN_PASSWORD}"`);
}

// Global middlewares
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Timing-safe string comparison to protect against side-channel timing attacks
 */
function safeCompare(inputString, secretString) {
  const hashA = crypto.createHash('sha256').update(String(inputString || '')).digest();
  const hashB = crypto.createHash('sha256').update(String(secretString || '')).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// ==========================================
// API ROUTES
// ==========================================

/**
 * GET /api/messages
 * Public: Visitors and owner can read all published messages.
 */
app.get('/api/messages', (req, res) => {
  try {
    const messages = dbService.getAllMessages();
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to summon messages from the crypt.' });
  }
});

/**
 * POST /api/messages
 * Owner Only: Create a new message card.
 */
app.post('/api/messages', requireOwner, (req, res) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be hollow.' });
    }

    const trimmed = content.trim();
    if (trimmed.length > 5000) {
      return res.status(400).json({ error: 'Inscriptions must not exceed 5,000 characters.' });
    }

    const newMessage = dbService.createMessage(trimmed);
    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to carve message into stone.' });
  }
});

/**
 * PUT /api/messages/:id
 * Owner Only: Edit an existing message.
 */
app.put('/api/messages/:id', requireOwner, (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be hollow.' });
    }

    const trimmed = content.trim();
    if (trimmed.length > 5000) {
      return res.status(400).json({ error: 'Inscriptions must not exceed 5,000 characters.' });
    }

    const updated = dbService.updateMessage(id, trimmed);
    if (!updated) {
      return res.status(404).json({ error: 'Message not found in this graveyard.' });
    }

    res.json({
      success: true,
      message: updated
    });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to alter the inscription.' });
  }
});

/**
 * DELETE /api/messages/:id
 * Owner Only: Delete a message after confirmation.
 */
app.delete('/api/messages/:id', requireOwner, (req, res) => {
  try {
    const { id } = req.params;
    const deleted = dbService.deleteMessage(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Message not found or already banished.' });
    }

    res.json({
      success: true,
      message: 'Message has been banished back into the abyss.'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to banish the message.' });
  }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

/**
 * GET /api/auth/check
 * Public: Check if current visitor has a valid owner session.
 */
app.get('/api/auth/check', (req, res) => {
  const authenticated = isOwnerAuthenticated(req);
  res.json({ authenticated });
});

/**
 * POST /api/auth/login
 * Public (Rate-Limited): Log in using ADMIN_PASSWORD.
 */
app.post('/api/auth/login', checkLoginRateLimit, (req, res) => {
  const { password } = req.body;
  const clientIp = req.clientIp;

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'The password incantation is missing.' });
  }

  // Timing-safe password check
  const isValid = safeCompare(password, ADMIN_PASSWORD);

  if (!isValid) {
    const rateStatus = onLoginFailure(clientIp);
    if (rateStatus.lockedUntil > 0) {
      return res.status(429).json({
        error: 'Too many incorrect attempts! The crypt is locked for 15 minutes.',
        retryAfterSeconds: Math.ceil((rateStatus.lockedUntil - Date.now()) / 1000)
      });
    }

    return res.status(401).json({
      error: 'Incorrect incantation! The crypt remains locked.',
      remainingAttempts: rateStatus.remainingAttempts
    });
  }

  // Password valid! Clear failed attempts
  onLoginSuccess(clientIp);

  // Generate secure 256-bit token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

  dbService.createSession(sessionToken, maxAgeMs);

  // Set httpOnly cookie
  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/'
  });

  res.json({
    success: true,
    message: 'Welcome back, Crypt Keeper. Owner powers granted.'
  });
});

/**
 * POST /api/auth/logout
 * Owner: Clear session and cookie.
 */
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    dbService.deleteSession(token);
  }

  res.clearCookie('session_token', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/'
  });

  res.json({
    success: true,
    message: 'Crypt sealed. You have returned to mortal view.'
  });
});

// Single Page Application fallback: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🕯️  Halloween Message Board is conjured on http://localhost:${PORT}`);
    console.log(`🎃 Owner mode protected by environment variable ADMIN_PASSWORD`);
    console.log(`🦇 Ready to welcome ghosts and mortals!\n`);
  });
}

module.exports = app;
