// Happy Yummy shop tests: menu, cart, checkout, orders, kitchen.
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = 'chef@example.com';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const users = require('../src/models/userStore');
const orders = require('../src/models/orderStore');
const dishes = require('../src/models/dishStore');
const { availableDates, validateSchedule } = require('../src/utils/schedule');
const { findItem } = require('../src/data/menu');

const PASSWORD = 'Str0ng!Pass';
const token = (html) => html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];

async function newAgent() {
  const agent = request.agent(app);
  const res = await agent.get('/menu');
  return { agent, csrf: token(res.text) };
}

async function signUpAndLogin(agent, csrf, name, email) {
  await agent.post('/register').type('form').send({ name, email, password: PASSWORD, confirmPassword: PASSWORD, _csrf: csrf });
  const page = await agent.get('/login');
  return agent.post('/login').type('form').send({ email, password: PASSWORD, _csrf: token(page.text) });
}

// Always uses a fresh CSRF token: logging in starts a new session with a new token.
async function addToCart(agent, _oldCsrf, itemId, times = 1) {
  const csrf = token((await agent.get('/menu')).text);
  for (let i = 0; i < times; i += 1) {
    await agent.post('/cart/add').type('form').send({ itemId, _csrf: csrf });
  }
}

function weekdayDate() {
  // Tomorrow-or-later date that is not Sat/Sun (always available)
  return availableDates().find((d) => !d.weekend && !d.label.startsWith('Today')).value;
}

const GOOD_CHECKOUT = {
  phone: '98765 43210',
  fulfilment: 'delivery',
  address: '12-3-45, Banjara Hills, Road No. 2, Hyderabad',
  slot: '7:00 – 8:00 PM',
  payment: 'upi',
};

async function checkout(agent, extra = {}) {
  const page = await agent.get('/checkout');
  return agent.post('/checkout').type('form')
    .send({ ...GOOD_CHECKOUT, date: weekdayDate(), ...extra, _csrf: token(page.text) });
}

beforeEach(() => {
  users.reset();
  orders.reset();
  dishes.reset();
});

test('home redirects to the menu, which shows the brand and dishes', async () => {
  const home = await request(app).get('/');
  assert.strictEqual(home.headers.location, '/menu');
  const res = await request(app).get('/menu');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Happy Yummy/);
  assert.match(res.text, /Chicken 65/);
  assert.match(res.text, /Double ka Meetha/);
  assert.match(res.text, /₹220/);
});

test('adding items updates the cart and totals use menu prices', async () => {
  const { agent, csrf } = await newAgent();
  await addToCart(agent, csrf, 'chicken-65', 2); // 2 × 220
  await addToCart(agent, csrf, 'gulab-jamun'); // 100
  const cart = await agent.get('/cart');
  assert.match(cart.text, /₹540/); // subtotal
  assert.match(cart.text, /You get free delivery/); // above ₹500
});

test('small orders pay the delivery fee', async () => {
  const { agent, csrf } = await newAgent();
  await addToCart(agent, csrf, 'gulab-jamun');
  const cart = await agent.get('/cart');
  assert.match(cart.text, /₹30/);
  assert.match(cart.text, /₹130/); // 100 + 30
});

test('cart quantity can be changed and removed', async () => {
  const { agent, csrf } = await newAgent();
  await addToCart(agent, csrf, 'apollo-fish', 3);
  await agent.post('/cart/update').type('form').send({ itemId: 'apollo-fish', qty: 0, _csrf: csrf });
  const cart = await agent.get('/cart');
  assert.match(cart.text, /Your cart is empty/);
});

test('unknown items and huge quantities are ignored or capped', async () => {
  const { agent, csrf } = await newAgent();
  await agent.post('/cart/add').type('form').send({ itemId: 'free-biryani', _csrf: csrf });
  await agent.post('/cart/update').type('form').send({ itemId: 'chicken-65', qty: 999, _csrf: csrf });
  const cart = await agent.get('/cart');
  assert.doesNotMatch(cart.text, /free-biryani/);
  assert.match(cart.text, /₹2,200/); // capped at 10 × 220
});

test('checkout requires login and keeps the cart after logging in', async () => {
  const { agent, csrf } = await newAgent();
  await addToCart(agent, csrf, 'chicken-65');
  const res = await agent.get('/checkout');
  assert.strictEqual(res.headers.location, '/login');
  const login = await signUpAndLogin(agent, csrf, 'Nandini Sunkara', 'nandini@example.com');
  assert.strictEqual(login.headers.location, '/checkout');
  const page = await agent.get('/checkout');
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /Chicken 65 × 1/);
});

test('placing an order saves it, clears the cart and shows tracking', async () => {
  const { agent, csrf } = await newAgent();
  await signUpAndLogin(agent, csrf, 'Nandini Sunkara', 'nandini@example.com');
  await addToCart(agent, csrf, 'pepper-chicken', 2);
  const res = await checkout(agent);
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /^\/orders\/HY-[A-Z0-9]{6}$/);

  const [order] = orders.all();
  assert.strictEqual(order.subtotal, 480); // 2 × 240
  assert.strictEqual(order.deliveryFee, 30); // below ₹500, so delivery is charged
  assert.strictEqual(order.total, 510);
  assert.strictEqual(order.customer.phone, '9876543210');
  assert.strictEqual(order.status, 'received');

  const page = await agent.get(res.headers.location);
  assert.match(page.text, /Thank you for your order/);
  const cart = await agent.get('/cart');
  assert.match(cart.text, /Your cart is empty/);
});

test('checkout validates phone, address and payment', async () => {
  const { agent, csrf } = await newAgent();
  await signUpAndLogin(agent, csrf, 'Nandini Sunkara', 'nandini@example.com');
  await addToCart(agent, csrf, 'chicken-65');
  const res = await checkout(agent, { phone: '12345', address: '', payment: '' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /valid 10-digit mobile number/);
  assert.match(res.text, /Delivery address is required/);
  assert.match(res.text, /Choose a payment method/);
  assert.strictEqual(orders.all().length, 0);
});

test('pickup orders need no address and no delivery fee', async () => {
  const { agent, csrf } = await newAgent();
  await signUpAndLogin(agent, csrf, 'Nandini Sunkara', 'nandini@example.com');
  await addToCart(agent, csrf, 'gulab-jamun');
  const res = await checkout(agent, { fulfilment: 'pickup', address: '' });
  assert.strictEqual(res.status, 302);
  const [order] = orders.all();
  assert.strictEqual(order.deliveryFee, 0);
  assert.strictEqual(order.total, 100);
});

test('checkout rejects dates outside the allowed range', async () => {
  const { agent, csrf } = await newAgent();
  await signUpAndLogin(agent, csrf, 'Nandini Sunkara', 'nandini@example.com');
  await addToCart(agent, csrf, 'chicken-65');
  const res = await checkout(agent, { date: '2020-01-01' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /choose a date from the list/);
});

test('schedule rules: same-day cutoff and weekend-only items', () => {
  // 10:00 AM IST on Wed 4 Nov 2026 → today allowed; 3:00 PM IST → today not allowed
  const morning = new Date('2026-11-04T04:30:00Z');
  const afternoon = new Date('2026-11-04T09:30:00Z');
  assert.strictEqual(availableDates(morning)[0].value, '2026-11-04');
  assert.strictEqual(availableDates(afternoon)[0].value, '2026-11-05');

  const prawns = [{ item: findItem('prawns-fry'), qty: 1 }];
  assert.match(validateSchedule('2026-11-05', '7:00 – 8:00 PM', prawns, morning), /Saturday and Sunday only/);
  assert.strictEqual(validateSchedule('2026-11-07', '7:00 – 8:00 PM', prawns, morning), null); // Saturday
  assert.match(validateSchedule('2026-11-05', '11:00 PM', [], morning), /time slot/);
});

test('customers see only their own orders', async () => {
  const a = await newAgent();
  await signUpAndLogin(a.agent, a.csrf, 'Asha', 'asha@example.com');
  await addToCart(a.agent, a.csrf, 'chicken-65');
  const placed = await checkout(a.agent);

  const b = await newAgent();
  await signUpAndLogin(b.agent, b.csrf, 'Bindu', 'bindu@example.com');
  const list = await b.agent.get('/orders');
  assert.match(list.text, /haven't ordered yet/);
  const other = await b.agent.get(placed.headers.location);
  assert.strictEqual(other.status, 404);
});

test('a customer can cancel only while the order is just received', async () => {
  const { agent, csrf } = await newAgent();
  await signUpAndLogin(agent, csrf, 'Nandini Sunkara', 'nandini@example.com');
  await addToCart(agent, csrf, 'chicken-65');
  const placed = await checkout(agent);
  const [order] = orders.all();

  orders.updateStatus(order.id, 'preparing');
  let page = await agent.get(placed.headers.location);
  await agent.post(`${placed.headers.location}/cancel`).type('form').send({ _csrf: token(page.text) });
  assert.strictEqual(orders.findById(order.id).status, 'preparing');

  orders.updateStatus(order.id, 'received');
  page = await agent.get(placed.headers.location);
  await agent.post(`${placed.headers.location}/cancel`).type('form').send({ _csrf: token(page.text) });
  assert.strictEqual(orders.findById(order.id).status, 'cancelled');
});

test('kitchen is only for admins, who can update order status', async () => {
  const customer = await newAgent();
  await signUpAndLogin(customer.agent, customer.csrf, 'Asha', 'asha@example.com');
  await addToCart(customer.agent, customer.csrf, 'apollo-fish');
  await checkout(customer.agent);
  const [order] = orders.all();

  const blocked = await customer.agent.get('/kitchen');
  assert.strictEqual(blocked.status, 403);

  const chef = await newAgent();
  await signUpAndLogin(chef.agent, chef.csrf, 'Chef', 'chef@example.com');
  const kitchen = await chef.agent.get('/kitchen');
  assert.strictEqual(kitchen.status, 200);
  assert.match(kitchen.text, new RegExp(order.id));
  assert.match(kitchen.text, /9876543210/);

  await chef.agent.post(`/kitchen/orders/${order.id}/status`).type('form')
    .send({ status: 'preparing', _csrf: token(kitchen.text) });
  assert.strictEqual(orders.findById(order.id).status, 'preparing');
});

// ---------- Admin: dish photos + description ----------
// A real 1×1 PNG, and a file that only pretends to be an image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function loginChef() {
  const chef = await newAgent();
  await signUpAndLogin(chef.agent, chef.csrf, 'Chef', 'chef@example.com');
  return chef.agent;
}

async function editDish(agent, itemId, { description = '', photos = 0, remove = [], file = PNG } = {}) {
  const csrf = token((await agent.get('/menu')).text);
  const req = agent.post(`/menu/${itemId}/edit`).field('_csrf', csrf);
  remove.forEach((f) => req.field('remove', f));
  req.field('description', description);
  for (let i = 0; i < photos; i += 1) req.attach('photos', file, `photo${i}.png`);
  await req;
  return (await agent.get('/menu')).text;
}

test('admin can upload 3 photos and a short description for a dish', async () => {
  const chef = await loginChef();
  const page = await editDish(chef, 'chicken-65', { description: 'Crispy, fiery and fresh.', photos: 3 });

  const saved = dishes.get('chicken-65');
  assert.strictEqual(saved.images.length, 3);
  assert.strictEqual(saved.description, 'Crispy, fiery and fresh.');
  assert.match(page, /Chicken 65 updated/);
  assert.match(page, /Crispy, fiery and fresh\./);
  assert.match(page, /1 \/ 3/);

  const photo = await request(app).get(`/uploads/${saved.images[0]}`);
  assert.strictEqual(photo.status, 200);
  assert.match(photo.headers['content-type'], /image\/png/);

  // Customers see the photos but not the edit form
  const guest = await request(app).get('/menu');
  assert.match(guest.text, new RegExp(saved.images[0]));
  assert.doesNotMatch(guest.text, /class="dish-edit"/);
});

test('a dish can have at most 3 photos; removing one makes room', async () => {
  const chef = await loginChef();
  let page = await editDish(chef, 'gulab-jamun', { photos: 4 });
  assert.match(page, /at most 3 photos/);
  assert.strictEqual(dishes.get('gulab-jamun').images.length, 0);

  await editDish(chef, 'gulab-jamun', { photos: 3 });
  page = await editDish(chef, 'gulab-jamun', { photos: 1 });
  assert.match(page, /at most 3 photos/);

  const [first] = dishes.get('gulab-jamun').images;
  await editDish(chef, 'gulab-jamun', { photos: 1, remove: [first] });
  const after = dishes.get('gulab-jamun').images;
  assert.strictEqual(after.length, 3);
  assert.ok(!after.includes(first));
});

test('dish edits reject long descriptions and non-image files', async () => {
  const chef = await loginChef();
  let page = await editDish(chef, 'apollo-fish', { description: 'a'.repeat(101) });
  assert.match(page, /at most 100 letters/);

  page = await editDish(chef, 'apollo-fish', { photos: 1, file: Buffer.from('<script>alert(1)</script> not an image') });
  assert.match(page, /Only JPG, PNG, WebP or GIF/);
  assert.deepStrictEqual(dishes.get('apollo-fish').images, []);

  await editDish(chef, 'apollo-fish', { description: 'b'.repeat(100) });
  assert.strictEqual(dishes.get('apollo-fish').description.length, 100);
});

test('only admins can edit dishes', async () => {
  const customer = await newAgent();
  await signUpAndLogin(customer.agent, customer.csrf, 'Asha', 'asha@example.com');
  const csrf = token((await customer.agent.get('/menu')).text);
  const res = await customer.agent.post('/menu/chicken-65/edit').type('form')
    .send({ description: 'hacked', _csrf: csrf });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(dishes.get('chicken-65').description, '');
});

// ---------- Admin: add new dishes ----------
async function addDish(agent, fields, photos = 0) {
  const csrf = token((await agent.get('/menu')).text);
  const req = agent.post('/menu/new').field('_csrf', csrf);
  Object.entries(fields).forEach(([k, v]) => req.field(k, v));
  for (let i = 0; i < photos; i += 1) req.attach('photos', PNG, `p${i}.png`);
  return req;
}

const NEW_DISH = { category: 'sweets', name: 'Rasmalai', price: '150', unit: '4 pieces', description: 'Soft paneer discs in saffron milk.' };

test('admin can add a new dish with photos, and customers can order it', async () => {
  const chef = await loginChef();
  const res = await addDish(chef, NEW_DISH, 2);
  assert.strictEqual(res.status, 302);

  const [dish] = dishes.listCustom();
  assert.strictEqual(dish.name, 'Rasmalai');
  assert.strictEqual(dish.price, 150);
  assert.strictEqual(dishes.get(dish.id).images.length, 2);

  const guest = await newAgent();
  assert.match((await guest.agent.get('/menu')).text, /Rasmalai/);
  assert.doesNotMatch((await guest.agent.get('/menu')).text, /Add new dish/);
  await addToCart(guest.agent, guest.csrf, dish.id, 2);
  assert.match((await guest.agent.get('/cart')).text, /Rasmalai[\s\S]*₹300/);
});

test('new dish form validates fields, the 100-letter limit and 3 photos', async () => {
  const chef = await loginChef();
  let res = await addDish(chef, { ...NEW_DISH, name: '', price: 'abc', description: 'x'.repeat(101) });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Dish name is required/);
  assert.match(res.text, /whole price/);
  assert.match(res.text, /at most 100 letters/);
  assert.match(res.text, /class="dish add-dish" id="add-sweets" open/);

  res = await addDish(chef, NEW_DISH, 4);
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /at most 3 photos/);
  assert.strictEqual(dishes.listCustom().length, 0);
});

test('only added dishes can be deleted, and only by admins', async () => {
  const chef = await loginChef();
  await addDish(chef, NEW_DISH, 1);
  const [dish] = dishes.listCustom();

  const customer = await newAgent();
  await signUpAndLogin(customer.agent, customer.csrf, 'Asha', 'asha@example.com');
  let csrf = token((await customer.agent.get('/menu')).text);
  assert.strictEqual((await customer.agent.post('/menu/new').type('form').send({ ...NEW_DISH, _csrf: csrf })).status, 403);
  assert.strictEqual((await customer.agent.post(`/menu/${dish.id}/delete`).type('form').send({ _csrf: csrf })).status, 403);

  csrf = token((await chef.get('/menu')).text);
  await chef.post('/menu/chicken-65/delete').type('form').send({ _csrf: csrf });
  assert.ok(findItem('chicken-65'));

  await chef.post(`/menu/${dish.id}/delete`).type('form').send({ _csrf: csrf });
  assert.strictEqual(dishes.listCustom().length, 0);
  assert.strictEqual(findItem(dish.id), null);
});
