// Run with: npm test
process.env.NODE_ENV = 'test';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const users = require('../src/models/userStore');
const { validatePassword } = require('../src/utils/validators');

const VALID = {
  name: 'Nandini Sunkara',
  email: 'nandini@example.com',
  password: 'Str0ng!Pass',
  confirmPassword: 'Str0ng!Pass',
};

// Each test uses its own agent (cookie jar) and fetches the CSRF token from a form.
async function getAgentWithToken(path = '/register') {
  const agent = request.agent(app);
  const res = await agent.get(path);
  const match = res.text.match(/name="_csrf" value="([a-f0-9]+)"/);
  return { agent, token: match[1] };
}

async function register(data) {
  const { agent, token } = await getAgentWithToken('/register');
  return agent.post('/register').type('form').send({ ...data, _csrf: token });
}

async function login(data) {
  const { agent, token } = await getAgentWithToken('/login');
  const res = await agent.post('/login').type('form').send({ ...data, _csrf: token });
  return { agent, res };
}

beforeEach(() => users.reset());

test('registration page renders', async () => {
  const res = await request(app).get('/register');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Create your account/);
});

test('valid registration creates user with a hashed password', async () => {
  const res = await register(VALID);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
  const user = users.findByEmail(VALID.email);
  assert.ok(user);
  assert.notStrictEqual(user.passwordHash, VALID.password);
  assert.match(user.passwordHash, /^\$2[aby]\$12\$/); // bcrypt, cost 12
});

test('registration rejects empty fields', async () => {
  const res = await register({ name: '', email: '', password: '', confirmPassword: '' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Name is required/);
  assert.match(res.text, /Email is required/);
  assert.match(res.text, /Password is required/);
});

test('registration rejects invalid email', async () => {
  const res = await register({ ...VALID, email: 'not-an-email' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Enter a valid email address/);
});

test('registration rejects weak password', async () => {
  const res = await register({ ...VALID, password: 'weak', confirmPassword: 'weak' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Password must contain/);
});

test('registration rejects mismatched passwords', async () => {
  const res = await register({ ...VALID, confirmPassword: 'Different1!' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Passwords do not match/);
});

test('registration rejects duplicate email (case-insensitive)', async () => {
  await register(VALID);
  const res = await register({ ...VALID, email: 'NANDINI@example.com' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /already exists/);
});

test('form without CSRF token is rejected', async () => {
  const res = await request(app).post('/register').type('form').send(VALID);
  assert.strictEqual(res.status, 403);
});

test('login succeeds with correct credentials and opens dashboard', async () => {
  await register(VALID);
  const { agent, res } = await login({ email: VALID.email, password: VALID.password });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/dashboard');
  const dash = await agent.get('/dashboard');
  assert.strictEqual(dash.status, 200);
  assert.match(dash.text, /Welcome, Nandini Sunkara/);
});

test('login fails with wrong password (generic message)', async () => {
  await register(VALID);
  const { res } = await login({ email: VALID.email, password: 'Wrong!Pass1' });
  assert.strictEqual(res.status, 401);
  assert.match(res.text, /Invalid email or password/);
});

test('login fails for unknown email with same generic message', async () => {
  const { res } = await login({ email: 'nobody@example.com', password: VALID.password });
  assert.strictEqual(res.status, 401);
  assert.match(res.text, /Invalid email or password/);
});

test('login rejects empty fields', async () => {
  const { res } = await login({ email: '', password: '' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Email is required/);
  assert.match(res.text, /Password is required/);
});

test('dashboard requires login', async () => {
  const res = await request(app).get('/dashboard');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('logout ends the session', async () => {
  await register(VALID);
  const { agent } = await login({ email: VALID.email, password: VALID.password });
  const dash = await agent.get('/dashboard');
  const token = dash.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  await agent.post('/logout').type('form').send({ _csrf: token });
  const after = await agent.get('/dashboard');
  assert.strictEqual(after.status, 302);
});

// ---------- Forgot / reset password ----------
const { outbox } = require('../src/utils/mailer');

async function requestReset(email) {
  const { agent, token } = await getAgentWithToken('/forgot-password');
  return agent.post('/forgot-password').type('form').send({ email, _csrf: token });
}

async function submitNewPassword(link, password, confirmPassword = password) {
  const path = new URL(link).pathname;
  const { agent, token } = await getAgentWithToken(path);
  return agent.post(path).type('form').send({ password, confirmPassword, _csrf: token });
}

test('login page has a forgot password link', async () => {
  const res = await request(app).get('/login');
  assert.match(res.text, /href="\/forgot-password"/);
});

test('forgot password sends a reset link and the new password works', async () => {
  await register(VALID);
  outbox.length = 0;
  const res = await requestReset(VALID.email);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].to, VALID.email);

  const reset = await submitNewPassword(outbox[0].link, 'N3w!Password');
  assert.strictEqual(reset.status, 302);
  assert.strictEqual(reset.headers.location, '/login');

  const oldLogin = await login({ email: VALID.email, password: VALID.password });
  assert.strictEqual(oldLogin.res.status, 401);
  const newLogin = await login({ email: VALID.email, password: 'N3w!Password' });
  assert.strictEqual(newLogin.res.headers.location, '/dashboard');
});

test('forgot password does not reveal whether an email exists', async () => {
  outbox.length = 0;
  const res = await requestReset('nobody@example.com');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
  assert.strictEqual(outbox.length, 0);
});

test('reset link works only once', async () => {
  await register(VALID);
  outbox.length = 0;
  await requestReset(VALID.email);
  const link = outbox[0].link;
  await submitNewPassword(link, 'N3w!Password');
  const second = await request(app).get(new URL(link).pathname);
  assert.strictEqual(second.status, 302);
  assert.strictEqual(second.headers.location, '/forgot-password');
});

test('reset rejects a weak new password and invalid tokens', async () => {
  await register(VALID);
  outbox.length = 0;
  await requestReset(VALID.email);
  const weak = await submitNewPassword(outbox[0].link, 'weak');
  assert.strictEqual(weak.status, 400);
  assert.match(weak.text, /Password must contain/);

  const bad = await request(app).get('/reset-password/' + 'a'.repeat(64));
  assert.strictEqual(bad.headers.location, '/forgot-password');
});

test('password rules', () => {
  assert.strictEqual(validatePassword('Str0ng!Pass'), null);
  assert.ok(validatePassword('alllowercase1!'));
  assert.ok(validatePassword('NoNumber!'));
  assert.ok(validatePassword('NoSpecial1'));
});
