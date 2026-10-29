# NP App: Registration & Login

A small, secure web app with user registration, login, form validation, and a protected dashboard.
It is built with **Node.js, Express, EJS, bcrypt and sessions**.

## Features

- Registration with server-side **and** client-side validation (name, email, strong password, confirm password)
- Passwords hashed with **bcrypt** (cost 12); plain passwords are never stored or echoed back
- Login with a generic error ("Invalid email or password") so attackers can't tell which emails exist
- Session cookies that are `httpOnly`, `sameSite=lax` and `secure` in production; the session ID is regenerated on login
- CSRF tokens on every form, rate limiting on login and registration, and secure headers via Helmet
- **Forgot password**: a one-time reset link, valid for 30 minutes, is emailed to the user (or printed in the terminal if email isn't configured)
- Protected `/dashboard` route and a logout action
- Responsive UI (mobile → desktop) with dark mode, a show/hide password toggle and a live password-rule checklist
- 20 automated tests (Node's built-in test runner + Supertest)

## Project structure

```
Regist_app/
├── public/                  # Static files served to the browser
│   ├── css/styles.css       # Responsive styles
│   └── js/validation.js     # Client-side validation & UI helpers
├── src/
│   ├── app.js               # Express app setup (security, sessions, routes)
│   ├── server.js            # Starts the HTTP server
│   ├── middleware/
│   │   ├── auth.js          # requireAuth / redirectIfAuthenticated guards
│   │   └── csrf.js          # CSRF token protection
│   ├── models/userStore.js  # User storage (JSON file; swap for a real DB)
│   ├── routes/auth.js       # /register, /login, /dashboard, /logout
│   ├── utils/validators.js  # Server-side validation rules
│   ├── utils/mailer.js      # Sends password-reset emails
│   └── views/               # EJS templates (pages + partials)
├── tests/auth.test.js       # Automated tests
├── data/                    # users.json is created here at runtime (git-ignored)
├── .env.example             # Environment variable template
├── .gitignore
└── package.json
```

## Run it locally

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev                 # auto-restarts on changes (or: npm start)
```

Open http://localhost:3000.

## Test

```bash
npm test
```

Manual checks: submit empty forms, an invalid email, a weak password, mismatched passwords, a duplicate email,
a wrong password at login, and visit `/dashboard` while logged out (it should redirect to `/login`).

## Forgot password

1. On the Log in page, click **Forgot password?** and enter your email.
2. **Without email set up:** the reset link is printed in the terminal where `npm run dev` is running. Copy it into the browser.
   **With email set up:** fill in the `SMTP_*` values in `.env` (see `.env.example`; for Gmail, use an App Password) and the link is emailed.
3. Choose a new password. The link works only once and expires after 30 minutes.

## Password rules

8–72 characters, with at least one lowercase letter, one uppercase letter, one number and one special character.

## Production notes

- Set a strong `SESSION_SECRET` and `NODE_ENV=production`, and serve over HTTPS.
- Replace the JSON file store with a real database (PostgreSQL/MySQL/MongoDB) and a persistent session store
  (e.g. `connect-redis`), because the default in-memory session store is for development only.
