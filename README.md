# PSA Analytics Portal — v2.0
### SQLite + Express Backend | Sanathan Textiles Limited

---

## 📦 What's in this folder

```
psa-portal/
├── server/
│   ├── index.js          ← Express server (port 3000)
│   ├── database.js       ← SQLite schema (15 tables)
│   ├── migrate.js        ← Seeds database from PSA data (run once)
│   ├── routes/
│   │   ├── projects.js
│   │   ├── plants.js
│   │   ├── risks.js
│   │   ├── compliance.js
│   │   ├── milestones.js
│   │   ├── alerts.js
│   │   ├── postcod.js
│   │   ├── volume.js
│   │   ├── revenue.js
│   │   ├── history.js
│   │   └── comments.js
│   └── db/
│       └── psa.db        ← auto-created on first run
├── public/
│   └── index.html        ← full frontend (served statically)
├── package.json
└── README.md
```

---

## ⚙️ Requirements

- **Node.js v16 or higher**
- Download from: https://nodejs.org (choose LTS version)
- To verify: `node --version`

---

## 🚀 Setup & Run (3 steps)

### Step 1 — Install dependencies
```bash
cd psa-portal
npm install
```

### Step 2 — Seed the database (run ONCE only)
```bash
npm run migrate
```
You should see:
```
✓ projects
✓ plants
✓ compliance_snapshot
✓ risks
✓ compliance
✓ milestones
✓ alerts
✓ postcod
✓ volume_summary
✓ volume_offtake
✓ volume_generation
✓ volume_ld
✓ volume_psa_term
✓ revenue_monthly
✓ revenue_waterfall
✓ revenue_projection
✅  Migration complete — database ready
```

### Step 3 — Start the server
```bash
npm start
```

Open browser: **http://localhost:3000**

---

## 🔐 Login credentials

| Username | Password       | Access  |
|----------|----------------|---------|
| admin    | sanathan2026   | Full    |
| viewer   | psa2026        | Full    |

> To change credentials: edit the `USERS` object in `server/index.js`

---

## 🔄 Development mode (auto-restart on file change)

```bash
npm run dev
```
Requires nodemon (installed automatically with `npm install`).

---

## 📊 How dynamic charts work

Every chart reads live data from the API:

| Chart | API endpoint |
|---|---|
| MSG achievement | `GET /api/volume/ld/msg-achievement` |
| Compliance scores | `GET /api/compliance/chart-data` |
| Risk heat map | `GET /api/risks/chart-data` |
| Risk radar | `GET /api/risks/chart-data` |
| Revenue waterfall | `GET /api/revenue/waterfall/chart-data` |
| 10-yr projection | `GET /api/revenue/projection/chart-data` |
| Monthly generation | `GET /api/volume/generation/chart-data` |
| Milestone bar | `GET /api/milestones/chart-data` |
| Gauges | Computed from above |

**When you edit a cell → it calls `PUT /api/...` → chart re-renders automatically.**

---

## 🗄️ Database

- File location: `server/db/psa.db`
- Engine: SQLite (via better-sqlite3)
- **To reset and re-seed:** delete `psa.db` and run `npm run migrate` again
- **To back up:** copy `psa.db` to a safe location

---

## 📡 REST API Reference

All endpoints require Basic Auth header.

### Projects
```
GET    /api/projects
GET    /api/projects/:projectId
PUT    /api/projects/:projectId
```

### Plants
```
GET    /api/plants?projectId=sanathan
POST   /api/plants
PUT    /api/plants/:id
DELETE /api/plants/:id
```

### Risks
```
GET    /api/risks?projectId=sanathan
GET    /api/risks/chart-data
POST   /api/risks
PUT    /api/risks/:id
DELETE /api/risks/:id
```

### Compliance
```
GET    /api/compliance?projectId=sanathan
GET    /api/compliance/chart-data
GET    /api/compliance/snapshot
POST   /api/compliance
PUT    /api/compliance/:id
DELETE /api/compliance/:id
```

### Milestones
```
GET    /api/milestones?projectId=sanathan
GET    /api/milestones/chart-data
POST   /api/milestones
PUT    /api/milestones/:id
DELETE /api/milestones/:id
```

### Alerts
```
GET    /api/alerts?projectId=sanathan
GET    /api/alerts/summary
POST   /api/alerts
PUT    /api/alerts/:id
DELETE /api/alerts/:id
```

### Post COD
```
GET    /api/postcod?projectId=sanathan
GET    /api/postcod/summary
POST   /api/postcod
PUT    /api/postcod/:id
DELETE /api/postcod/:id
```

### Volume
```
GET    /api/volume/summary
PUT    /api/volume/summary
GET    /api/volume/offtake
POST   /api/volume/offtake
PUT    /api/volume/offtake/:id
DELETE /api/volume/offtake/:id
GET    /api/volume/generation
GET    /api/volume/generation/chart-data
PUT    /api/volume/generation/:id
GET    /api/volume/ld
GET    /api/volume/ld/calculated
GET    /api/volume/ld/msg-achievement
PUT    /api/volume/ld/:id
GET    /api/volume/psa-term
PUT    /api/volume/psa-term/:id
```

### Revenue
```
GET    /api/revenue/summary
GET    /api/revenue/monthly
POST   /api/revenue/monthly
PUT    /api/revenue/monthly/:id
DELETE /api/revenue/monthly/:id
GET    /api/revenue/waterfall
GET    /api/revenue/waterfall/chart-data
POST   /api/revenue/waterfall
PUT    /api/revenue/waterfall/:id
DELETE /api/revenue/waterfall/:id
GET    /api/revenue/projection
GET    /api/revenue/projection/chart-data
PUT    /api/revenue/projection/:id
```

### History & Comments
```
GET    /api/history?projectId=sanathan&limit=100
DELETE /api/history?projectId=sanathan
GET    /api/comments?entityType=risks&entityId=CR-01
POST   /api/comments
DELETE /api/comments/:id
```

### Dashboard Aggregate
```
GET    /api/dashboard?projectId=sanathan
```

---

## ➕ Adding a new project

1. Open `server/migrate.js`
2. Duplicate the `projects` INSERT block with new values
3. Add plants for the new project
4. Run `npm run migrate` again (safe — uses INSERT OR REPLACE)
5. New project appears in sidebar "Project view" automatically

---

## 🚢 Deploying to production

When ready to host publicly:

### Option A — Render.com (free tier)
1. Push code to GitHub
2. Create new Web Service on render.com
3. Build command: `npm install`
4. Start command: `node server/index.js`
5. Add env var: `NODE_ENV=production`

### Option B — Any VPS (Ubuntu)
```bash
npm install -g pm2
pm2 start server/index.js --name psa-portal
pm2 startup
pm2 save
```

### Option C — Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN node server/migrate.js
EXPOSE 3000
CMD ["node","server/index.js"]
```

---

## 🔧 Changing the port

```bash
PORT=8080 npm start
```
Or set `PORT` environment variable.

---

## 📁 Backup & restore data

```bash
# Backup
cp server/db/psa.db server/db/psa_backup_$(date +%Y%m%d).db

# Restore
cp server/db/psa_backup_20260424.db server/db/psa.db
```

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'better-sqlite3'` | Run `npm install` again |
| `SQLITE_CANTOPEN` error | Check that `server/db/` folder exists |
| Charts not updating | Click ↺ refresh button on that page |
| Login loop | Clear browser session storage and retry |
| Port 3000 in use | Run `PORT=3001 npm start` |
| DB is empty | Run `npm run migrate` |

---

*PSA Analytics Portal v2.0 — Built for Sanathan Textiles Limited*
