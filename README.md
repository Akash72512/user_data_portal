# User Data Portal (Node + Express + SQLite)

Features:
- User registration/login (bcrypt + express-session)
- User dashboard to add records with Input, Output, and Remaining = Input - Output
- History table for each user
- Admin panel with all users' records
- Export all data to Excel (.xlsx)

## Quick Start

1. Install Node.js 18+
2. Extract this project and open a terminal in the folder
3. Run:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000

Data files are stored under `data/` (SQLite DB + session storage).

## Project Structure

```
server.js
src/db.js
views/
  layout.ejs
  login.ejs
  register.ejs
  user_dashboard.ejs
  admin_dashboard.ejs
  partials/title.ejs
public/styles.css
scripts/create_admin.js
data/ (auto-created)
```
