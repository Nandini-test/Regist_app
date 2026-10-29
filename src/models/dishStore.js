// Admin edits to menu dishes (photos + short description), kept in a JSON file.
// The base menu stays in src/data/menu.js; these values are layered on top of it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isTest = process.env.NODE_ENV === 'test';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const DATA_FILE = isTest
  ? path.join(DATA_DIR, 'dishes.test.json')
  : process.env.DISHES_FILE || path.join(DATA_DIR, 'dishes.json');

// New dishes added by the admin from the Menu page.
const CUSTOM_FILE = isTest
  ? path.join(DATA_DIR, 'custom-dishes.test.json')
  : process.env.CUSTOM_DISHES_FILE || path.join(DATA_DIR, 'custom-dishes.json');

// Uploaded dish photos are saved here and served at /uploads/<file>.
const UPLOADS_DIR = isTest
  ? path.join(DATA_DIR, 'uploads.test')
  : process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');

const MAX_PHOTOS = 3;
const MAX_DESCRIPTION = 100;

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(dishes) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(dishes, null, 2));
}

function get(itemId) {
  return { images: [], description: '', ...load()[itemId] };
}

function update(itemId, fields) {
  const dishes = load();
  dishes[itemId] = { ...get(itemId), ...fields };
  save(dishes);
  return dishes[itemId];
}

// Menu item with the admin's photos and description applied.
function withEdits(item) {
  const edits = get(item.id);
  const images = edits.images.length
    ? edits.images.map((file) => `/uploads/${file}`)
    : item.image ? [item.image] : [];
  return { ...item, images, photoFiles: edits.images, description: edits.description || item.description };
}

// ---------- Dishes added by the admin ----------
function listCustom() {
  try {
    return JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveCustom(list) {
  fs.mkdirSync(path.dirname(CUSTOM_FILE), { recursive: true });
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(list, null, 2));
}

function addCustom({ category, name, price, unit, description, nonVeg, emoji }) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'dish';
  const dish = {
    id: `${slug}-${crypto.randomBytes(3).toString('hex')}`,
    category, name, price, unit, description, nonVeg, emoji,
    custom: true,
    createdAt: new Date().toISOString(),
  };
  saveCustom([...listCustom(), dish]);
  return dish;
}

// Deletes an admin-added dish together with its photos. Built-in dishes can't be deleted.
function removeCustom(id) {
  const list = listCustom();
  if (!list.some((d) => d.id === id)) return false;
  saveCustom(list.filter((d) => d.id !== id));
  const dishes = load();
  (dishes[id] ? dishes[id].images : []).forEach((f) => fs.rmSync(path.join(UPLOADS_DIR, f), { force: true }));
  delete dishes[id];
  save(dishes);
  return true;
}

function reset() {
  save({});
  saveCustom([]);
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
}

module.exports = {
  get, update, withEdits, listCustom, addCustom, removeCustom, reset,
  UPLOADS_DIR, MAX_PHOTOS, MAX_DESCRIPTION,
};
