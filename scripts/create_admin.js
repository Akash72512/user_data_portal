const bcrypt = require('bcrypt');
const { db } = require('../src/db');

const [,, name, email, password] = process.argv;
if (!name || !email || !password) {
  console.log('Usage: npm run make-admin -- "<Name>" "<email@example.com>" "<password>"');
  process.exit(1);
}

(async () => {
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)',
      [name, email.toLowerCase(), hash],
      (err) => {
        if (err) {
          console.error('Failed to create admin:', err.message);
          process.exit(1);
        } else {
          console.log('Admin created:', email);
          process.exit(0);
        }
      });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
