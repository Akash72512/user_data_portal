const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const ExcelJS = require('exceljs');
const { db, initDb } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  session({
    store: new SQLiteStore({ dir: path.join(__dirname, 'data'), db: 'sessions.sqlite' }),
    secret: process.env.SESSION_SECRET || 'please-change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
  })
);

// Helpers
function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}
function ensureAdmin(req, res, next) {
  if (req.session.user && req.session.user.is_admin) return next();
  res.redirect('/login');
}

// Initialize DB
initDb().then(() => {
  console.log("SQLite DB ready.");
}).catch(err => {
  console.error("DB init failed:", err);
  process.exit(1);
});

// Routes
app.get('/', (req, res) => {
  if (req.session.user) {
    return req.session.user.is_admin ? res.redirect('/admin') : res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).render('register', { error: 'All fields are required.' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 0)',
        [name, email.toLowerCase(), hashed],
        function (err) {
          if (err) {
            if (err.message && err.message.includes('UNIQUE')) {
              return reject(new Error('Email already registered.'));
            }
            return reject(err);
          }
          resolve();
        }
      );
    });
    res.redirect('/login');
  } catch (e) {
    res.status(400).render('register', { error: e.message || 'Registration failed.' });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).render('login', { error: 'Email and password required.' });
  }
  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], async (err, user) => {
    if (err) return res.status(500).render('login', { error: 'Server error.' });
    if (!user) return res.status(401).render('login', { error: 'Invalid credentials.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).render('login', { error: 'Invalid credentials.' });
    req.session.user = { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin };
    return user.is_admin ? res.redirect('/admin') : res.redirect('/dashboard');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// User dashboard
app.get('/dashboard', ensureAuth, (req, res) => {
  if (req.session.user.is_admin) return res.redirect('/admin');
  db.all(
    'SELECT id, input_value, output_value, remaining_value, note, created_at FROM records WHERE user_id = ? ORDER BY created_at DESC',
    [req.session.user.id],
    (err, rows) => {
      if (err) rows = [];
      res.render('user_dashboard', { user: req.session.user, records: rows, error: null });
    }
  );
});

app.post('/records', ensureAuth, (req, res) => {
  if (req.session.user.is_admin) return res.redirect('/admin');
  const { input_value, output_value, note } = req.body;
  const iv = parseFloat(input_value);
  const ov = parseFloat(output_value);
  if (Number.isNaN(iv) || Number.isNaN(ov)) {
    db.all(
      'SELECT id, input_value, output_value, remaining_value, note, created_at FROM records WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.user.id],
      (err, rows) => {
        return res.status(400).render('user_dashboard', { user: req.session.user, records: rows || [], error: 'Please enter valid numbers.' });
      }
    );
    return;
  }
  const remaining = iv - ov;
  db.run(
    'INSERT INTO records (user_id, input_value, output_value, remaining_value, note, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
    [req.session.user.id, iv, ov, remaining, note || null],
    (err) => {
      if (err) console.error(err);
      res.redirect('/dashboard');
    }
  );
});

// Admin panel
app.get('/admin', ensureAdmin, (req, res) => {
  const sql = `
    SELECT r.id, u.name, u.email, r.input_value, r.output_value, r.remaining_value, r.note, r.created_at
    FROM records r
    JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) rows = [];
    res.render('admin_dashboard', { user: req.session.user, rows });
  });
});

app.get('/admin/export', ensureAdmin, async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('All Records');
  sheet.columns = [
    { header: 'Record ID', key: 'id', width: 12 },
    { header: 'User Name', key: 'name', width: 20 },
    { header: 'User Email', key: 'email', width: 28 },
    { header: 'Input', key: 'input_value', width: 12 },
    { header: 'Output', key: 'output_value', width: 12 },
    { header: 'Remaining', key: 'remaining_value', width: 12 },
    { header: 'Note', key: 'note', width: 30 },
    { header: 'Created At (UTC)', key: 'created_at', width: 24 }
  ];

  db.all(`
    SELECT r.id, u.name, u.email, r.input_value, r.output_value, r.remaining_value, r.note, r.created_at
    FROM records r
    JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
  `, [], async (err, rows) => {
    if (err) rows = [];
    rows.forEach(r => sheet.addRow(r));
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="all-records.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
