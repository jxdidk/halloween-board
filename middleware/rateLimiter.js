// middleware/rateLimiter.js - Rate limiting for failed login attempts
const dbService = require('../db');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

function getClientIp(req) {
  // Respect X-Forwarded-For if behind a reverse proxy, otherwise direct socket IP
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
}

function checkLoginRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const record = dbService.getFailedAttempts(ip);
  const now = Date.now();

  if (record && record.locked_until > now) {
    const remainingSeconds = Math.ceil((record.locked_until - now) / 1000);
    return res.status(429).json({
      error: 'The crypt gate is sealed! Too many failed attempts. Please wait before trying again.',
      retryAfterSeconds: remainingSeconds
    });
  }

  req.clientIp = ip;
  next();
}

function onLoginFailure(ip) {
  return dbService.recordFailedAttempt(ip, MAX_FAILED_ATTEMPTS, LOCKOUT_MS);
}

function onLoginSuccess(ip) {
  dbService.resetFailedAttempts(ip);
}

module.exports = {
  checkLoginRateLimit,
  onLoginFailure,
  onLoginSuccess,
  MAX_FAILED_ATTEMPTS
};
