# Happy Yummy 😋: Home Kitchen Ordering

A home-kitchen food ordering app: customers browse non-veg starters and sweets, add them to a cart and pre-order for
evening delivery or pickup. The cook manages orders from a Kitchen page. Includes secure registration and login.
It is built with **Node.js, Express, EJS, bcrypt and sessions**.

## Features

**Ordering**
- Menu of starters and sweets with prices, veg/non-veg marks and a "weekends only" option (edit in `src/data/menu.js`)
- Cart with quantity controls; prices are always taken from the server-side menu
- Checkout: delivery or pickup, mobile number, address, date and time slot, UPI or cash on delivery, kitchen notes
- Pre-order rules (India time): same-day orders close at 2 PM; order up to 3 days ahead; ₹30 delivery, free above ₹500
- Order tracking (Received → Preparing → Out for delivery → Delivered) and "My orders"; customers can cancel until preparation starts
- **Kitchen page** (`/kitchen`) for the cook to see upcoming orders and update their status (emails in `ADMIN_EMAILS`)
- **Add new dishes** (admins): an "Add new dish" card at the end of each menu section to create a dish with name, price, portion, veg/non-veg, up to 3 photos and a short description (max 100 letters). Added dishes can be deleted again.
- **Dish photos & descriptions**: admins get a small "✏️ Edit" link on every menu card that opens an image icon to upload up to 3 photos (JPG/PNG/WebP/GIF, 2 MB each) and a short description field (max 100 letters). Customers see the photos as a swipeable gallery.

**Accounts & security**
- Registration with server-side **and** client-side validation (name, email, strong password, confirm password)
- Passwords hashed with **bcrypt** (cost 12); plain passwords are never stored or echoed back
- Login with a generic error ("Invalid email or password") so attackers can't tell which emails exist
- Session cookies that are `httpOnly`, `sameSite=lax` and `secure` in production; the session ID is regenerated on login
- CSRF tokens on every form, rate limiting on login and registration, and secure headers via Helmet
- **Forgot password**: a one-time reset link, valid for 30 minutes, is emailed to the user (or printed in the terminal if email isn't configured)
- Protected `/dashboard` route and a logout action
- Responsive UI (mobile → desktop) with dark mode, a show/hide password toggle and a live password-rule checklist
- 34 automated tests (Node's built-in test runner + Supertest)

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
│   ├── data/menu.js         # Menu items, prices, delivery fee and time slots
│   ├── models/orderStore.js # Order storage (JSON file)
│   ├── routes/auth.js       # /register, /login, /dashboard, /logout
│   ├── routes/shop.js       # /menu, /cart, /checkout, /orders, /kitchen
│   ├── utils/validators.js  # Server-side validation rules
│   ├── utils/mailer.js      # Sends password-reset emails
│   ├── utils/cart.js        # Cart totals and delivery fee
│   ├── utils/schedule.js    # Delivery dates, time slots, same-day cutoff
│   └── views/               # EJS templates (pages + partials)
├── tests/                   # Automated tests (auth + shop)
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

## Kitchen access

Add your email to `ADMIN_EMAILS` in `.env` (and in Render → Environment), then register/log in with that email.
A **Kitchen** link appears in the top bar.

## Changing the menu

Open `src/data/menu.js` to change dishes, prices, units, descriptions and emojis, or the delivery fee, time slots and
same-day cutoff. To use a real photo, put it in `public/images/` and set `image: '/images/your-photo.jpg'` on the item.

## Forgot password

1. On the Log in page, click **Forgot password?** and enter your email.
2. **Without email set up:** the reset link is printed in the terminal where `npm run dev` is running. Copy it into the browser.
   **With email set up:** fill in the `SMTP_*` values in `.env` (see `.env.example`; for Gmail, use an App Password) and the link is emailed.
3. Choose a new password. The link works only once and expires after 30 minutes.

## Password rules

8–72 characters, with at least one lowercase letter, one uppercase letter, one number and one special character.

## Production notes

- Set a strong `SESSION_SECRET` and `NODE_ENV=production`, and serve over HTTPS.
- Orders, users, dish edits and uploaded dish photos (`data/uploads/`) are stored on disk, which free hosting (e.g. Render free) wipes on every restart/redeploy.
- Replace the JSON file store with a real database (PostgreSQL/MySQL/MongoDB) and a persistent session store
  (e.g. `connect-redis`), because the default in-memory session store is for development only.
