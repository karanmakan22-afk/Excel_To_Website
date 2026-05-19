// ============================================================
// server/routes/volume.js
// Volume & MSG — summary, offtake, generation, LD, PSA term
// All chart-data endpoints return Chart.js-ready structures
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

const PID = (req) => req.query.projectId || 'sanathan';

// ── SUMMARY ─────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM volume_summary WHERE projectId = ?').get(PID(req));
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/summary', (req, res) => {
  try {
    const db  = getDB();
    const pid = PID(req);
    const fields = ['annualMSG','monthsElapsed','ytdActual','msgStatus','annualRevBudget','lifetimeRev'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    db.prepare(`UPDATE volume_summary SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE projectId=?`)
      .run(...updates.map(f => req.body[f]), pid);
    res.json(db.prepare('SELECT * FROM volume_summary WHERE projectId=?').get(pid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OFFTAKE (25-year table) ──────────────────────────────────
router.get('/offtake', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM volume_offtake WHERE projectId=? ORDER BY year').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chart-ready offtake data
router.get('/offtake/chart-data', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM volume_offtake WHERE projectId=? ORDER BY year').all(PID(req));
    res.json({
      labels:         rows.map(r => `Y${r.year}`),
      expectedEnergy: rows.map(r => r.expectedEnergy),
      minOfftake:     rows.map(r => r.minOfftake)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/offtake', (req, res) => {
  try {
    const db = getDB();
    const { projectId='sanathan', year, expectedEnergy=0, minOfftake=0 } = req.body;
    if (!year) return res.status(400).json({ error: 'year required' });
    const info = db.prepare('INSERT OR REPLACE INTO volume_offtake (projectId, year, expectedEnergy, minOfftake) VALUES (?,?,?,?)')
      .run(projectId, year, expectedEnergy, minOfftake);
    res.status(201).json(db.prepare('SELECT * FROM volume_offtake WHERE id=?').get(info.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/offtake/:id', (req, res) => {
  try {
    const db = getDB();
    const { expectedEnergy, minOfftake } = req.body;
    db.prepare(`UPDATE volume_offtake SET expectedEnergy=COALESCE(?,expectedEnergy), minOfftake=COALESCE(?,minOfftake), updatedAt=datetime('now') WHERE id=?`)
      .run(expectedEnergy, minOfftake, req.params.id);
    res.json(db.prepare('SELECT * FROM volume_offtake WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/offtake/:id', (req, res) => {
  try {
    getDB().prepare('DELETE FROM volume_offtake WHERE id=?').run(req.params.id);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MONTHLY GENERATION ───────────────────────────────────────
router.get('/generation', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM volume_generation WHERE projectId=? ORDER BY id').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chart-ready: line chart — generation vs MSG floor per plant
router.get('/generation/chart-data', (req, res) => {
  try {
    const db     = getDB();
    const rows   = db.prepare('SELECT * FROM volume_generation WHERE projectId=? ORDER BY id').all(PID(req));
    const months = ['jul','aug','sep','oct','nov','dec','jan','feb','mar'];
    const labels = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

    const datasets = rows.map((row, i) => {
      const colors = ['#48a1c7','#f85149','#3fb950','#d29922'];
      return {
        id:              row.id,
        label:           row.plant,
        data:            months.map(m => row[m]),
        borderColor:     colors[i % colors.length],
        borderDash:      row.plant.includes('Floor') ? [5, 3] : [],
        tension:         0.3,
        fill:            false,
        spanGaps:        true
      };
    });

    res.json({ labels, datasets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/generation/:id', (req, res) => {
  try {
    const db = getDB();
    const months = ['jul','aug','sep','oct','nov','dec','jan','feb','mar'];
    const updates = months.filter(m => req.body[m] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No month values to update' });
    db.prepare(`UPDATE volume_generation SET ${updates.map(m=>`${m}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(m => req.body[m] === '' ? null : req.body[m]), req.params.id);

    const db2 = getDB();
    const row = db2.prepare('SELECT * FROM volume_generation WHERE id=?').get(req.params.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LD CALCULATION ───────────────────────────────────────────
router.get('/ld', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM volume_ld WHERE projectId=? ORDER BY id').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Auto-calculate LD from current DB values
router.get('/ld/calculated', (req, res) => {
  try {
    const db      = getDB();
    const pid     = PID(req);
    const summary = db.prepare('SELECT monthsElapsed FROM volume_summary WHERE projectId=?').get(pid);
    const months  = summary?.monthsElapsed || 0;
    const rows    = db.prepare('SELECT * FROM volume_ld WHERE projectId=?').all(pid);

    const calculated = rows.map(r => {
      const proRated  = months > 0 ? parseFloat(((r.annualMSG / 12) * months).toFixed(2)) : 0;
      const shortfall = Math.max(0, parseFloat((proRated - r.ytdActual).toFixed(2)));
      const grossLD   = parseFloat((shortfall * r.ldRate / 10).toFixed(3));
      const breach    = r.ytdActual < (proRated * (r.threshold / 100)) && months > 0;
      return {
        ...r,
        monthsElapsed:  months,
        proRatedMSG:    proRated,
        ytdShortfall:   shortfall,
        grossLD,
        netLD:          grossLD,
        ldStatus:       months === 0 ? 'Pre-COD' : breach ? 'LD Triggered' : 'No Shortfall',
        breach
      };
    });

    res.json(calculated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/ld/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM volume_ld WHERE id=?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'LD row not found' });

    const fields = ['annualMSG','ytdActual','ytdShortfall','ldRate','grossLD',
                    'netLD','psaClause','threshold','ldStatus','remedyDeadline'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    db.prepare(`UPDATE volume_ld SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `volume_ld.${old.plant}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>req.body[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM volume_ld WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MSG achievement — used by dashboard gauge and bar chart
router.get('/ld/msg-achievement', (req, res) => {
  try {
    const db   = getDB();
    const pid  = PID(req);
    const rows = db.prepare('SELECT plant, annualMSG, ytdActual FROM volume_ld WHERE projectId=?').all(pid);
    const result = rows.map(r => ({
      plant:      r.plant,
      annualMSG:  r.annualMSG,
      ytdActual:  r.ytdActual,
      achieved:   r.annualMSG > 0 ? parseFloat(((r.ytdActual / r.annualMSG) * 100).toFixed(1)) : 0
    }));
    const avg = result.length ? result.reduce((s, r) => s + r.achieved, 0) / result.length : 0;
    res.json({ plants: result, portfolioAvg: parseFloat(avg.toFixed(1)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PSA TERM PROGRESS ────────────────────────────────────────
router.get('/psa-term', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM volume_psa_term WHERE projectId=? ORDER BY id').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/psa-term/:id', (req, res) => {
  try {
    const db = getDB();
    const fields = ['cod','tariff','yearsElapsed','yearsRemaining','termPct',
                    'cumMSGCommitted','cumActualGen','annualRevBudget','lifetimeRev','notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    db.prepare(`UPDATE volume_psa_term SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);
    res.json(db.prepare('SELECT * FROM volume_psa_term WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
