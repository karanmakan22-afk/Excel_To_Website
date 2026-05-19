// ============================================================
// server/database.js
// SQLite connection singleton + full schema creation
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

// Use /data on Render (persistent disk) or local server/db folder
const DB_DIR = path.join(__dirname, 'db');

const DB_PATH = path.join(DB_DIR, 'psa.db');

// Auto-create the directory if it doesn't exist (fixes Render deploy)
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db = null;

function getDB() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');   // better concurrent reads
  _db.pragma('foreign_keys = ON');
  createSchema(_db);
  return _db;
}

function createSchema(db) {
  db.exec(`

    -- ── PROJECTS ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS projects (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId       TEXT    NOT NULL UNIQUE,
      name            TEXT    NOT NULL,
      client          TEXT    NOT NULL,
      psaRef          TEXT,
      totalMW         REAL    DEFAULT 0,
      blendedTariff   REAL    DEFAULT 0,
      annualMSG       REAL    DEFAULT 0,
      annualRevBudget REAL    DEFAULT 0,
      lifetimeRev     REAL    DEFAULT 0,
      npv8            REAL    DEFAULT 0,
      psaTerm         INTEGER DEFAULT 25,
      psaStart        TEXT,
      psaEnd          TEXT,
      codDate         TEXT,
      status          TEXT    DEFAULT 'Pre-COD',
      complianceScore REAL    DEFAULT 0,
      technology      TEXT,
      states          TEXT,
      createdAt       TEXT    DEFAULT (datetime('now')),
      updatedAt       TEXT    DEFAULT (datetime('now'))
    );

    -- ── PLANTS ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS plants (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId   TEXT    NOT NULL REFERENCES projects(projectId),
      plantId     TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      technology  TEXT,
      city        TEXT,
      state       TEXT,
      mw          REAL    DEFAULT 0,
      acMW        REAL    DEFAULT 0,
      tariff      REAL    DEFAULT 0,
      codTarget   TEXT,
      plantMSG    REAL    DEFAULT 0,
      p90MU       REAL    DEFAULT 0,
      status      TEXT    DEFAULT 'Pre-COD',
      risk        TEXT    DEFAULT 'Pre-COD',
      updatedAt   TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, plantId)
    );

    -- ── COMPLIANCE SNAPSHOT (dashboard tiles) ─────────────
    CREATE TABLE IF NOT EXISTS compliance_snapshot (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT    NOT NULL REFERENCES projects(projectId),
      area      TEXT    NOT NULL,
      status    TEXT    DEFAULT 'Compliant',
      score     REAL    DEFAULT 0,
      updatedAt TEXT    DEFAULT (datetime('now'))
    );

    -- ── RISK REGISTER ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS risks (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId          TEXT    NOT NULL REFERENCES projects(projectId),
      riskId             TEXT    NOT NULL,
      category           TEXT    NOT NULL,
      plantsAffected     TEXT,
      statesAffected     TEXT,
      severity           TEXT    DEFAULT 'Medium',
      likelihood         REAL,
      impact             REAL,
      score              REAL,
      description        TEXT,
      regulatoryRef      TEXT,
      mitigation         TEXT,
      escalationTrigger  TEXT,
      trend              TEXT    DEFAULT 'Stable',
      lastReviewed       TEXT,
      status             TEXT    DEFAULT 'Open',
      updatedAt          TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, riskId)
    );

    -- ── REGULATORY COMPLIANCE ─────────────────────────────
    CREATE TABLE IF NOT EXISTS compliance (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId   TEXT    NOT NULL REFERENCES projects(projectId),
      refId       TEXT    NOT NULL,
      area        TEXT    NOT NULL,
      law         TEXT,
      plantsText  TEXT,
      requirement TEXT,
      status      TEXT    DEFAULT 'Compliant',
      score       REAL    DEFAULT 0,
      frequency   TEXT,
      lastAudit   TEXT,
      nextAudit   TEXT,
      responsible TEXT,
      action      TEXT,
      owner       TEXT,
      targetDate  TEXT,
      updatedAt   TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, refId)
    );

    -- ── MILESTONES ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS milestones (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId    TEXT    NOT NULL REFERENCES projects(projectId),
      msId         TEXT    NOT NULL,
      plantId      TEXT,
      category     TEXT,
      description  TEXT,
      psaRef       TEXT,
      plannedDate  TEXT,
      pctComplete  REAL    DEFAULT 0,
      status       TEXT    DEFAULT 'Upcoming',
      consequence  TEXT,
      responsible  TEXT,
      dueBy        TEXT,
      priority     TEXT    DEFAULT 'Medium',
      updatedAt    TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, msId)
    );

    -- ── ALERTS ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS alerts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId      TEXT    NOT NULL REFERENCES projects(projectId),
      alertId        TEXT    NOT NULL,
      priority       TEXT    DEFAULT 'High',
      plantId        TEXT,
      plant          TEXT,
      category       TEXT,
      description    TEXT,
      psaRef         TEXT,
      raised         TEXT,
      actionRequired TEXT,
      owner          TEXT,
      targetDate     TEXT,
      escalation     TEXT    DEFAULT 'L1',
      status         TEXT    DEFAULT 'Open',
      impact         TEXT,
      linkedMS       TEXT,
      updatedAt      TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, alertId)
    );

    -- ── POST COD TRACKER ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS postcod (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId      TEXT    NOT NULL REFERENCES projects(projectId),
      pcId           TEXT    NOT NULL,
      plantId        TEXT,
      state          TEXT,
      category       TEXT,
      description    TEXT,
      psaRef         TEXT,
      plannedDate    TEXT,
      actualRevised  TEXT,
      pctComplete    REAL    DEFAULT 0,
      status         TEXT    DEFAULT 'Upcoming',
      consequence    TEXT,
      responsible    TEXT,
      nextAction     TEXT,
      dueBy          TEXT,
      priority       TEXT    DEFAULT 'Medium',
      updatedAt      TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, pcId)
    );

    -- ── VOLUME: PSA SUMMARY ───────────────────────────────
    CREATE TABLE IF NOT EXISTS volume_summary (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId        TEXT    NOT NULL REFERENCES projects(projectId) UNIQUE,
      annualMSG        REAL    DEFAULT 0,
      monthsElapsed    INTEGER DEFAULT 0,
      ytdActual        TEXT    DEFAULT 'Pre-COD',
      msgStatus        TEXT    DEFAULT 'Pre-COD',
      annualRevBudget  REAL    DEFAULT 0,
      lifetimeRev      REAL    DEFAULT 0,
      updatedAt        TEXT    DEFAULT (datetime('now'))
    );

    -- ── VOLUME: 25-YEAR OFFTAKE ───────────────────────────
    CREATE TABLE IF NOT EXISTS volume_offtake (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId      TEXT    NOT NULL REFERENCES projects(projectId),
      year           INTEGER NOT NULL,
      expectedEnergy REAL    DEFAULT 0,
      minOfftake     REAL    DEFAULT 0,
      updatedAt      TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, year)
    );

    -- ── VOLUME: MONTHLY GENERATION ────────────────────────
    CREATE TABLE IF NOT EXISTS volume_generation (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId       TEXT    NOT NULL REFERENCES projects(projectId),
      plant           TEXT    NOT NULL,
      annualGuarantee REAL    DEFAULT 0,
      jul             REAL,
      aug             REAL,
      sep             REAL,
      oct             REAL,
      nov             REAL,
      dec             REAL,
      jan             REAL,
      feb             REAL,
      mar             REAL,
      updatedAt       TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, plant)
    );

    -- ── VOLUME: LD CALCULATION ────────────────────────────
    CREATE TABLE IF NOT EXISTS volume_ld (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId       TEXT    NOT NULL REFERENCES projects(projectId),
      plant           TEXT    NOT NULL,
      state           TEXT,
      annualMSG       REAL    DEFAULT 0,
      ytdActual       REAL    DEFAULT 0,
      ytdShortfall    REAL    DEFAULT 0,
      ldRate          REAL    DEFAULT 0,
      grossLD         REAL    DEFAULT 0,
      netLD           REAL    DEFAULT 0,
      psaClause       TEXT,
      threshold       REAL    DEFAULT 95,
      ldStatus        TEXT    DEFAULT 'Pre-COD',
      remedyDeadline  TEXT,
      updatedAt       TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, plant)
    );

    -- ── VOLUME: PSA TERM PROGRESS ─────────────────────────
    CREATE TABLE IF NOT EXISTS volume_psa_term (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId          TEXT    NOT NULL REFERENCES projects(projectId),
      plant              TEXT    NOT NULL,
      cod                TEXT,
      tariff             REAL    DEFAULT 0,
      yearsElapsed       REAL    DEFAULT 0,
      yearsRemaining     REAL    DEFAULT 25,
      termPct            REAL    DEFAULT 0,
      cumMSGCommitted    REAL    DEFAULT 0,
      cumActualGen       REAL    DEFAULT 0,
      annualRevBudget    REAL    DEFAULT 0,
      lifetimeRev        REAL    DEFAULT 0,
      notes              TEXT,
      updatedAt          TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, plant)
    );

    -- ── REVENUE: MONTHLY ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS revenue_monthly (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId        TEXT    NOT NULL REFERENCES projects(projectId),
      plant            TEXT    NOT NULL,
      state            TEXT,
      tariff           REAL    DEFAULT 0,
      msgRevPerMonth   REAL    DEFAULT 0,
      jul              REAL    DEFAULT 0,
      aug              REAL    DEFAULT 0,
      sep              REAL    DEFAULT 0,
      oct              REAL    DEFAULT 0,
      nov              REAL    DEFAULT 0,
      dec              REAL    DEFAULT 0,
      jan              REAL    DEFAULT 0,
      feb              REAL    DEFAULT 0,
      mar              REAL    DEFAULT 0,
      ytdRevenue       REAL    DEFAULT 0,
      ytdBudget        REAL    DEFAULT 0,
      variance         REAL    DEFAULT 0,
      billed           REAL    DEFAULT 0,
      collected        REAL    DEFAULT 0,
      outstanding      REAL    DEFAULT 0,
      updatedAt        TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, plant)
    );

    -- ── REVENUE: WATERFALL ────────────────────────────────
    CREATE TABLE IF NOT EXISTS revenue_waterfall (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT    NOT NULL REFERENCES projects(projectId),
      stage     TEXT    NOT NULL,
      value     REAL    DEFAULT 0,
      sortOrder INTEGER DEFAULT 0,
      updatedAt TEXT    DEFAULT (datetime('now'))
    );

    -- ── REVENUE: 10-YEAR PROJECTION ───────────────────────
    CREATE TABLE IF NOT EXISTS revenue_projection (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT    NOT NULL REFERENCES projects(projectId),
      fy        TEXT    NOT NULL,
      plt01     REAL    DEFAULT 0,
      plt02     REAL    DEFAULT 0,
      plt03     REAL    DEFAULT 0,
      total     REAL    DEFAULT 0,
      updatedAt TEXT    DEFAULT (datetime('now')),
      UNIQUE(projectId, fy)
    );

    -- ── CHANGE HISTORY ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS change_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT,
      field     TEXT    NOT NULL,
      oldVal    TEXT,
      newVal    TEXT,
      author    TEXT    DEFAULT 'User',
      timestamp TEXT    DEFAULT (datetime('now'))
    );

    -- ── COMMENTS ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      entityType TEXT    NOT NULL,
      entityId   TEXT    NOT NULL,
      comment    TEXT    NOT NULL,
      author     TEXT    DEFAULT 'User',
      timestamp  TEXT    DEFAULT (datetime('now'))
    );

    -- ── INDEXES ───────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_risks_project     ON risks(projectId);
    CREATE INDEX IF NOT EXISTS idx_compliance_project ON compliance(projectId);
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(projectId);
    CREATE INDEX IF NOT EXISTS idx_alerts_project    ON alerts(projectId);
    CREATE INDEX IF NOT EXISTS idx_postcod_project   ON postcod(projectId);
    CREATE INDEX IF NOT EXISTS idx_history_project   ON change_history(projectId);
    CREATE INDEX IF NOT EXISTS idx_history_ts        ON change_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_comments_entity   ON comments(entityType, entityId);

  `);
}

module.exports = { getDB };
