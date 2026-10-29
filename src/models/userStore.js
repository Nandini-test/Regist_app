// Simple JSON-file user store. Swap for a real database (PostgreSQL, MongoDB, etc.) in production.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE =
  process.env.NODE_ENV === 'test'
    ? path.join(__dirname, '..', '..', 'data', 'users.test.json')
    : process.env.DATA_FILE || path.join(__dirname, '..', '..', 'data', 'users.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(users) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function findByEmail(email) {
  const target = String(email).trim().toLowerCase();
  return load().find((u) => u.email === target) || null;
}

function findById(id) {
  return load().find((u) => u.id === id) || null;
}

function create({ name, email, passwordHash }) {
  const users = load();
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  save(users);
  return user;
}

function findByResetTokenHash(tokenHash) {
  return load().find((u) => u.resetTokenHash === tokenHash) || null;
}

function update(id, fields) {
  const users = load();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;
  users[index] = { ...users[index], ...fields };
  save(users);
  return users[index];
}

function reset() {
  save([]);
}

module.exports = { findByEmail, findById, findByResetTokenHash, create, update, reset };
