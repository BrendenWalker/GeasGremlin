const crypto = require('crypto');
const bcrypt = require('bcrypt');

const COOKIE = 'geasgremlin_session';
const SESSION_SECONDS = 14 * 24 * 60 * 60;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function checkPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

function sessionCookie(token) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function usernameOk(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_]{3,80}$/.test(name);
}

function passwordOk(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

module.exports = {
  COOKIE,
  SESSION_SECONDS,
  hashToken,
  newToken,
  hashPassword,
  checkPassword,
  readCookie,
  sessionCookie,
  clearSessionCookie,
  usernameOk,
  passwordOk,
};
