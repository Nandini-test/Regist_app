// Cart lives in the session as { itemId: quantity }.
// Prices always come from the menu on the server, never from the browser.
const { findItem, settings } = require('../data/menu');

function getCart(session) {
  if (!session.cart || typeof session.cart !== 'object') session.cart = {};
  return session.cart;
}

function setQty(session, itemId, qty) {
  const cart = getCart(session);
  if (!findItem(itemId)) return false;
  const n = Math.max(0, Math.min(settings.maxQtyPerItem, Math.floor(Number(qty) || 0)));
  if (n === 0) delete cart[itemId];
  else cart[itemId] = n;
  return true;
}

function addItem(session, itemId, qty = 1) {
  const cart = getCart(session);
  return setQty(session, itemId, (cart[itemId] || 0) + (Math.floor(Number(qty)) || 1));
}

function summarize(session, fulfilment = 'delivery') {
  const cart = getCart(session);
  const lines = Object.entries(cart)
    .map(([id, qty]) => {
      const item = findItem(id);
      return item ? { item, qty, lineTotal: item.price * qty } : null;
    })
    .filter(Boolean);
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const deliveryFee =
    fulfilment === 'delivery' && subtotal > 0 && subtotal < settings.freeDeliveryAbove ? settings.deliveryFee : 0;
  const count = lines.reduce((sum, l) => sum + l.qty, 0);
  return { lines, subtotal, deliveryFee, total: subtotal + deliveryFee, count };
}

function clear(session) {
  session.cart = {};
}

module.exports = { getCart, setQty, addItem, summarize, clear };
