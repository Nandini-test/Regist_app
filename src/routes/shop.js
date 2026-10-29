const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { categories, settings, allItems, findItem } = require('../data/menu');
const cart = require('../utils/cart');
const orders = require('../models/orderStore');
const users = require('../models/userStore');
const dishes = require('../models/dishStore');
const { detectImageType } = require('../middleware/upload');
const { availableDates, validateSchedule, formatDateKey } = require('../utils/schedule');
const { validateCheckout, validateNewDish } = require('../utils/validators');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helpers available in shop templates
router.use((req, res, next) => {
  res.locals.rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
  res.locals.formatDate = formatDateKey;
  res.locals.STATUSES = orders.STATUSES;
  res.locals.settings = settings;
  next();
});

// ---------- Menu ----------
// newDish: { errors, values } of a rejected "Add new dish" form, so it reopens with what was typed.
function renderMenu(req, res, { newDish = null, status = 200 } = {}) {
  return res.status(status).render('menu', {
    title: 'Menu',
    wide: true,
    categories,
    items: allItems().map(dishes.withEdits),
    inCart: cart.getCart(req.session),
    newDish,
    MAX_PHOTOS: dishes.MAX_PHOTOS,
    MAX_DESCRIPTION: dishes.MAX_DESCRIPTION,
  });
}

router.get('/menu', (req, res) => renderMenu(req, res));

// ---------- Dish photos (admin) ----------
// Checks uploaded photos; returns an error message or the real image type of each file.
function checkPhotos(req, keptCount) {
  if (req.uploadError) return { error: req.uploadError };
  const uploads = req.files || [];
  const types = uploads.map((f) => detectImageType(f.buffer));
  if (types.includes(null)) return { error: 'Only JPG, PNG, WebP or GIF photos can be uploaded.' };
  if (keptCount + uploads.length > dishes.MAX_PHOTOS) {
    return { error: `A dish can have at most ${dishes.MAX_PHOTOS} photos. Remove one before adding more.` };
  }
  return { uploads, types };
}

// Random file names, so uploads can never overwrite each other or escape the folder.
function writePhotos(itemId, uploads, types) {
  fs.mkdirSync(dishes.UPLOADS_DIR, { recursive: true });
  return uploads.map((file, i) => {
    const name = `${itemId}-${crypto.randomBytes(8).toString('hex')}.${types[i]}`;
    fs.writeFileSync(path.join(dishes.UPLOADS_DIR, name), file.buffer);
    return name;
  });
}

// ---------- Add new dish (admin) ----------
router.post('/menu/new', requireAdmin, (req, res) => {
  const { errors, values } = validateNewDish(req.body, categories.map((c) => c.id));
  const photos = checkPhotos(req, 0);
  if (photos.error) errors.photos = photos.error;
  if (Object.keys(errors).length) {
    return renderMenu(req, res, { newDish: { errors, values }, status: 400 });
  }

  const category = categories.find((c) => c.id === values.category);
  const dish = dishes.addCustom({
    category: category.id,
    name: values.name,
    price: Number(values.price),
    unit: values.unit || '1 plate',
    description: values.description,
    nonVeg: values.nonVeg,
    emoji: category.emoji,
  });
  dishes.update(dish.id, { images: writePhotos(dish.id, photos.uploads, photos.types) });

  req.session.flash = { type: 'success', message: `${dish.name} added to the menu.` };
  return res.redirect(`/menu#${dish.id}`);
});

router.post('/menu/:id/delete', requireAdmin, (req, res) => {
  const item = findItem(req.params.id);
  const removed = Boolean(item) && dishes.removeCustom(item.id);
  req.session.flash = removed
    ? { type: 'success', message: `${item.name} was removed from the menu.` }
    : { type: 'error', message: 'Only dishes added from this page can be deleted.' };
  res.redirect('/menu');
});

// ---------- Edit dish (admin): photos + short description ----------
router.post('/menu/:id/edit', requireAdmin, (req, res) => {
  const item = findItem(req.params.id);
  if (!item) {
    return res.status(404).render('error', { title: 'Dish not found', message: "We couldn't find that dish." });
  }
  const back = `/menu#${item.id}`;
  const fail = (message) => {
    req.session.flash = { type: 'error', message: `${item.name}: ${message}` };
    return res.redirect(back);
  };

  const description = String(req.body.description || '').replace(/\s+/g, ' ').trim();
  if (Array.from(description).length > dishes.MAX_DESCRIPTION) {
    return fail(`The description can be at most ${dishes.MAX_DESCRIPTION} letters.`);
  }

  const current = dishes.get(item.id).images;
  const toRemove = [].concat(req.body.remove || []).filter((f) => current.includes(f));
  const kept = current.filter((f) => !toRemove.includes(f));

  const photos = checkPhotos(req, kept.length);
  if (photos.error) return fail(photos.error);

  const added = writePhotos(item.id, photos.uploads, photos.types);
  toRemove.forEach((f) => fs.rmSync(path.join(dishes.UPLOADS_DIR, f), { force: true }));

  dishes.update(item.id, { images: [...kept, ...added], description });
  req.session.flash = { type: 'success', message: `${item.name} updated.` };
  return res.redirect(back);
});

// ---------- Cart ----------
router.post('/cart/add', (req, res) => {
  const item = findItem(req.body.itemId);
  if (item) {
    cart.addItem(req.session, item.id, req.body.qty || 1);
    req.session.flash = { type: 'success', message: `${item.name} added to your cart.` };
  }
  res.redirect(item ? `/menu#${item.id}` : '/menu');
});

router.get('/cart', (req, res) => {
  res.render('cart', { title: 'Your cart', wide: true, summary: cart.summarize(req.session) });
});

router.post('/cart/update', (req, res) => {
  cart.setQty(req.session, req.body.itemId, req.body.qty);
  res.redirect('/cart');
});

// ---------- Checkout ----------
function renderCheckout(res, req, { errors = {}, values = {}, status = 200 } = {}) {
  const user = users.findById(req.session.userId);
  const fulfilment = values.fulfilment || 'delivery';
  return res.status(status).render('checkout', {
    title: 'Checkout',
    wide: true,
    summary: cart.summarize(req.session, fulfilment),
    dates: availableDates(),
    errors,
    values: { fulfilment, payment: 'upi', ...values },
    user,
  });
}

router.get('/checkout', requireAuth, (req, res) => {
  if (cart.summarize(req.session).count === 0) return res.redirect('/menu');
  return renderCheckout(res, req);
});

router.post('/checkout', requireAuth, (req, res) => {
  const { errors, values } = validateCheckout(req.body);
  const summary = cart.summarize(req.session, values.fulfilment);

  if (summary.count === 0) {
    req.session.flash = { type: 'error', message: 'Your cart is empty.' };
    return res.redirect('/menu');
  }

  const scheduleError = validateSchedule(values.date, values.slot, summary.lines);
  if (scheduleError) errors.schedule = scheduleError;

  if (Object.keys(errors).length) return renderCheckout(res, req, { errors, values, status: 400 });

  const user = users.findById(req.session.userId);
  const order = orders.create({
    userId: user.id,
    customer: { name: user.name, email: user.email, phone: values.phone },
    items: summary.lines.map((l) => ({
      id: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty, lineTotal: l.lineTotal,
    })),
    subtotal: summary.subtotal,
    deliveryFee: summary.deliveryFee,
    total: summary.total,
    fulfilment: values.fulfilment,
    address: values.fulfilment === 'delivery' ? values.address : '',
    date: values.date,
    slot: values.slot,
    payment: values.payment,
    notes: values.notes,
  });

  cart.clear(req.session);
  req.session.flash = { type: 'success', message: `Order placed! Your order number is ${order.id}.` };
  return res.redirect(`/orders/${order.id}`);
});

// ---------- My orders ----------
router.get('/orders', requireAuth, (req, res) => {
  res.render('orders', { title: 'My orders', wide: true, list: orders.findByUser(req.session.userId) });
});

function loadOwnOrder(req, res) {
  const order = orders.findById(req.params.id);
  if (!order || (order.userId !== req.session.userId && !res.locals.isAdmin)) {
    res.status(404).render('error', { title: 'Order not found', message: "We couldn't find that order." });
    return null;
  }
  return order;
}

router.get('/orders/:id', requireAuth, (req, res) => {
  const order = loadOwnOrder(req, res);
  if (order) res.render('order', { title: `Order ${order.id}`, wide: true, order });
});

router.post('/orders/:id/cancel', requireAuth, (req, res) => {
  const order = loadOwnOrder(req, res);
  if (!order) return;
  if (order.status === 'received') {
    orders.updateStatus(order.id, 'cancelled');
    req.session.flash = { type: 'success', message: `Order ${order.id} has been cancelled.` };
  } else {
    req.session.flash = { type: 'error', message: 'This order is already being prepared, so it can no longer be cancelled.' };
  }
  res.redirect(`/orders/${order.id}`);
});

// ---------- Kitchen (admin) ----------
router.get('/kitchen', requireAdmin, (req, res) => {
  const show = req.query.show === 'all' ? 'all' : 'active';
  let list = orders.all();
  if (show === 'active') list = list.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  // Soonest delivery first
  list.sort((a, b) => `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`));
  res.render('kitchen', { title: 'Kitchen', wide: true, list, show });
});

router.post('/kitchen/orders/:id/status', requireAdmin, (req, res) => {
  const order = orders.updateStatus(req.params.id, req.body.status);
  req.session.flash = order
    ? { type: 'success', message: `${order.id} → ${orders.STATUSES[order.status]}` }
    : { type: 'error', message: 'Could not update that order.' };
  res.redirect('/kitchen');
});

module.exports = router;
