// ============================================================
// server/index.js
// Express server — Basic Auth, static serving, route mounting
// ============================================================

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { getDB }  = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── USERS (Basic Auth) ──────────────────────────────────────
// To change: update username/password pairs here
const USERS = {
  'admin':  'sanathan2026',
  'viewer': 'psa2026'
};

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── BASIC AUTH MIDDLEWARE ───────────────────────────────────
// Protects all /api/* routes
function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="PSA Portal"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [username, password] = decoded.split(':');

  if (USERS[username] && USERS[username] === password) {
    req.user = username;
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="PSA Portal"');
  return res.status(401).json({ error: 'Invalid credentials' });
}

// ── STATIC FILES ────────────────────────────────────────────
// Serves public/index.html and any other static assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API ROUTES ──────────────────────────────────────────────
// All API routes are protected by basicAuth
app.use('/api', basicAuth);

app.use('/api/projects',    require('./routes/projects'));
app.use('/api/plants',      require('./routes/plants'));
app.use('/api/risks',       require('./routes/risks'));
app.use('/api/compliance',  require('./routes/compliance'));
app.use('/api/milestones',  require('./routes/milestones'));
app.use('/api/alerts',      require('./routes/alerts'));
app.use('/api/postcod',     require('./routes/postcod'));
app.use('/api/volume',      require('./routes/volume'));
app.use('/api/revenue',     require('./routes/revenue'));
app.use('/api/history',     require('./routes/history'));
app.use('/api/comments',    require('./routes/comments'));

// ── DASHBOARD AGGREGATE ENDPOINT ───────────────────────────
// Single call that returns everything needed for the dashboard
app.get('/api/dashboard', basicAuth, (req, res) => {
  try {
    const db = getDB();
    const projectId = req.query.projectId || 'sanathan';

    const project          = db.prepare('SELECT * FROM projects WHERE projectId = ?').get(projectId);
    const plants           = db.prepare('SELECT * FROM plants WHERE projectId = ?').all(projectId);
    const compSnapshot     = db.prepare('SELECT * FROM compliance_snapshot WHERE projectId = ?').all(projectId);
    const riskSummary      = db.prepare(`
      SELECT
        SUM(CASE WHEN severity='Critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity='High'     THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN severity='Medium'   THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN severity='Low'      THEN 1 ELSE 0 END) as low
      FROM risks WHERE projectId = ?
    `).get(projectId);
    const criticalAlerts   = db.prepare(`SELECT * FROM alerts WHERE projectId = ? AND priority = 'Critical' AND status = 'Open'`).all(projectId);
    const msgAchievement   = db.prepare('SELECT plant, annualMSG, ytdActual FROM volume_ld WHERE projectId = ?').all(projectId);
    const revProjection    = db.prepare('SELECT * FROM revenue_projection WHERE projectId = ? ORDER BY fy').all(projectId);
    const avgCompliance    = db.prepare('SELECT AVG(score) as avg FROM compliance WHERE projectId = ?').get(projectId);
    const worsening        = db.prepare(`SELECT COUNT(*) as cnt FROM risks WHERE projectId = ? AND trend = 'Worsening'`).get(projectId);
    const atRiskComp       = db.prepare(`SELECT COUNT(*) as cnt FROM compliance WHERE projectId = ? AND status = 'At Risk'`).get(projectId);

    res.json({
      project,
      plants,
      complianceSnapshot: compSnapshot,
      riskSummary,
      criticalAlerts,
      msgAchievement,
      revenueProjection: revProjection,
      kpis: {
        avgComplianceScore: avgCompliance?.avg?.toFixed(1) || 0,
        worseningRisks:     worsening?.cnt || 0,
        atRiskCompliance:   atRiskComp?.cnt || 0
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GLOBAL ERROR HANDLER ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── CATCH-ALL — serve index.html for non-API routes ─────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── START ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║      PSA Analytics Portal — v2.0          ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  Server   : http://localhost:${PORT}           ║`);
  console.log('║  Username : admin                          ║');
  console.log('║  Password : sanathan2026                   ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  // Ensure DB is initialised on startup
  try {
    getDB();
    console.log('✓ Database connected —', require('path').join(__dirname, 'db', 'psa.db'));
  } catch (e) {
    console.error('✗ Database error:', e.message);
  }
});

module.exports = app;
