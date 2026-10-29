// Simple JSON-file order store. Swap for a real database in production.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE =
  process.env.NODE_ENV === 'test'
    ? path.join(__dirname, '..', '..', 'data', 'orders.test.json')
    : process.env.ORDERS_FILE || path.join(__dirname, '..', '..', 'data', 'orders.json');

const STATUSES = {
  received: 'Order received',
  preparing: 'Preparing',
  ready: 'Out for delivery / Ready for pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(orders) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
}

function newId() {
  // e.g. HY-7K3QX9 — short and easy to read over the phone
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'HY-';
  for (let i = 0; i < 6; i += 1) id += chars[crypto.randomInt(chars.length)];
  return id;
}

function create(order) {
  const orders = load();
  const now = new Date().toISOString();
  const record = { id: newId(), status: 'received', createdAt: now, updatedAt: now, ...order };
  orders.push(record);
  save(orders);
  return record;
}

function findById(id) {
  return load().find((o) => o.id === id) || null;
}

function findByUser(userId) {
  return load()
    .filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function all() {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function updateStatus(id, status) {
  if (!STATUSES[status]) return null;
  const orders = load();
  const order = orders.find((o) => o.id === id);
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  save(orders);
  return order;
}

function reset() {
  save([]);
}

module.exports = { STATUSES, create, findById, findByUser, all, updateStatus, reset };
