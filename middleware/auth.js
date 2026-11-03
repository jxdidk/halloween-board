// middleware/auth.js - Strict Server-Side Authentication
const dbService = require('../db');

/**
 * Middleware that strictly blocks non-owners from modifying messages.
 * Even if an attacker unhides frontend elements or issues direct cURL requests,
 * they will be rejected with HTTP 401 Unauthorized.
 */
function requireOwner(req, res, next) {
  const token = req.cookies?.session_token;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Only the crypt keeper (site owner) may cast spells here.'
    });
  }

  const session = dbService.getSession(token);
  if (!session) {
    // Clear dead/expired cookie
    res.clearCookie('session_token', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/'
    });
    return res.status(401).json({
      error: 'Session expired or invalid. Please re-enter the owner sanctum.'
    });
  }

  // Attach session info
  req.ownerSession = session;
  next();
}

/**
 * Helper to check authentication status without throwing 401
 */
function isOwnerAuthenticated(req) {
  const token = req.cookies?.session_token;
  if (!token) return false;
  const session = dbService.getSession(token);
  return !!session;
}

module.exports = {
  requireOwner,
  isOwnerAuthenticated
};
