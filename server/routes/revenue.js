// ============================================================
// server/routes/revenue.js
// Revenue monthly, waterfall, projection — full CRUD + charts
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

const PID = (req) => req.query.projectId || 'sanathan';

// ── SUMMARY ─────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  try {
    const db  = getDB();
    const pid = PID(req);
    // Aggregate from live monthly table
    const monthly = db.prepare('SELECT * FROM revenue_monthly WHERE projectId=?').all(pid);
    const proj    = db.prepare('SELECT * FROM projects WHERE projectId=?').get(pid);

    const totalYTD        = monthly.reduce((s, r) => s + (r.ytdRevenue || 0), 0);
    const totalBilled     = monthly.reduce((s, r) => s + (r.billed     || 0), 0);
    const totalCollected  = monthly.reduce((s, r) => s + (r.collected  || 0), 0);
    const totalOutstanding= monthly.reduce((s, r) => s + (r.outstanding|| 0), 0);
    const collectionEff   = totalBilled > 0
      ? parseFloat(((totalCollected / totalBilled) * 100).toFixed(1))
      : 0;

    res.json({
      annualBudget:      proj?.annualRevBudget || 67,
      lifetimeRev:       proj?.lifetimeRev     || 1630,
      npv8:              proj?.npv8            || 446,
      totalYTDRevenue:   parseFloat(totalYTD.toFixed(2)),
      totalBilled:       parseFloat(totalBilled.toFixed(2)),
      totalCollected:    parseFloat(totalCollected.toFixed(2)),
      totalOutstanding:  parseFloat(totalOutstanding.toFixed(2)),
      collectionEfficiency: collectionEff
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MONTHLY PLANT REVENUE ────────────────────────────────────
router.get('/monthly', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM revenue_monthly WHERE projectId=? ORDER BY id').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chart-ready monthly revenue — stacked line chart
router.get('/monthly/chart-data', (req, res) => {
  try {
    const db     = getDB();
    const rows   = db.prepare('SELECT * FROM revenue_monthly WHERE projectId=? ORDER BY id').all(PID(req));
    const months = ['jul','aug','sep','oct','nov','dec','jan','feb','mar'];
    const labels = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
    const colors = ['#48a1c7','#3fb950','#d29922','#f85149'];

    const datasets = rows.map((row, i) => ({
      id:          row.id,
      label:       row.plant,
      data:        months.map(m => row[m] || 0),
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length] + '33',
      tension:     0.3,
      fill:        false
    }));

    // MSG floor lines
    rows.forEach((row, i) => {
      datasets.push({
        label:      `${row.plant} MSG Floor`,
        data:       months.map(() => row.msgRevPerMonth || 0),
        borderColor:colors[i % colors.length],
        borderDash: [5, 3],
        tension:    0,
        fill:       false,
        pointRadius:0
      });
    });

    res.json({ labels, datasets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/monthly', (req, res) => {
  try {
    const db = getDB();
    const {
      projectId='sanathan', plant, state='', tariff=0, msgRevPerMonth=0,
      jul=0,aug=0,sep=0,oct=0,nov=0,dec=0,jan=0,feb=0,mar=0,
      ytdRevenue=0, ytdBudget=0, variance=0, billed=0, collected=0, outstanding=0
    } = req.body;
    if (!plant) return res.status(400).json({ error: 'plant required' });

    const info = db.prepare(`
      INSERT INTO revenue_monthly
        (projectId, plant, state, tariff, msgRevPerMonth,
         jul,aug,sep,oct,nov,dec,jan,feb,mar,
         ytdRevenue, ytdBudget, variance, billed, collected, outstanding)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, plant, state, tariff, msgRevPerMonth,
           jul,aug,sep,oct,nov,dec,jan,feb,mar,
           ytdRevenue, ytdBudget, variance, billed, collected, outstanding);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(projectId, `revenue_monthly.${plant}`, '', JSON.stringify(req.body), req.user || 'api');

    res.status(201).json(db.prepare('SELECT * FROM revenue_monthly WHERE id=?').get(info.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/monthly/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM revenue_monthly WHERE id=?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Revenue row not found' });

    const fields = ['state','tariff','msgRevPerMonth',
                    'jul','aug','sep','oct','nov','dec','jan','feb','mar',
                    'ytdRevenue','ytdBudget','variance','billed','collected','outstanding'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    // Auto-recalculate YTD if month columns are updated
    const months = ['jul','aug','sep','oct','nov','dec','jan','feb','mar'];
    const merged = { ...old, ...req.body };
    if (months.some(m => req.body[m] !== undefined)) {
      merged.ytdRevenue = parseFloat(months.reduce((s, m) => s + (parseFloat(merged[m]) || 0), 0).toFixed(2));
      merged.outstanding = parseFloat((merged.ytdRevenue - (merged.collected || 0)).toFixed(2));
      if (!updates.includes('ytdRevenue'))  updates.push('ytdRevenue');
      if (!updates.includes('outstanding')) updates.push('outstanding');
    }

    db.prepare(`UPDATE revenue_monthly SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => merged[f]), req.params.id);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `revenue_monthly.${old.plant}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>merged[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM revenue_monthly WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/monthly/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM revenue_monthly WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Revenue row not found' });
    db.prepare('DELETE FROM revenue_monthly WHERE id=?').run(req.params.id);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WATERFALL ────────────────────────────────────────────────
router.get('/waterfall', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM revenue_waterfall WHERE projectId=? ORDER BY sortOrder').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chart-ready waterfall data
router.get('/waterfall/chart-data', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM revenue_waterfall WHERE projectId=? ORDER BY sortOrder').all(PID(req));
    res.json({
      labels:     rows.map(r => r.stage),
      values:     rows.map(r => Math.abs(r.value)),
      rawValues:  rows.map(r => r.value),
      colors:     rows.map(r => r.value < 0 ? 'rgba(248,81,73,0.75)' : 'rgba(72,161,199,0.75)')
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/waterfall', (req, res) => {
  try {
    const db = getDB();
    const { projectId='sanathan', stage, value=0 } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage required' });
    const maxOrder = db.prepare('SELECT MAX(sortOrder) as m FROM revenue_waterfall WHERE projectId=?').get(projectId);
    const info = db.prepare('INSERT INTO revenue_waterfall (projectId, stage, value, sortOrder) VALUES (?,?,?,?)')
      .run(projectId, stage, value, (maxOrder?.m || 0) + 1);
    res.status(201).json(db.prepare('SELECT * FROM revenue_waterfall WHERE id=?').get(info.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/waterfall/:id', (req, res) => {
  try {
    const db = getDB();
    const { stage, value } = req.body;
    db.prepare(`UPDATE revenue_waterfall SET stage=COALESCE(?,stage), value=COALESCE(?,value), updatedAt=datetime('now') WHERE id=?`)
      .run(stage, value, req.params.id);
    res.json(db.prepare('SELECT * FROM revenue_waterfall WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/waterfall/:id', (req, res) => {
  try {
    getDB().prepare('DELETE FROM revenue_waterfall WHERE id=?').run(req.params.id);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── 10-YEAR PROJECTION ───────────────────────────────────────
router.get('/projection', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM revenue_projection WHERE projectId=? ORDER BY fy').all(PID(req));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Chart-ready stacked bar
router.get('/projection/chart-data', (req, res) => {
  try {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM revenue_projection WHERE projectId=? ORDER BY fy').all(PID(req));
    res.json({
      labels: rows.map(r => r.fy),
      datasets: [
        { label:'PLT-01', data: rows.map(r => r.plt01), backgroundColor:'rgba(72,161,199,0.8)',  borderRadius:2 },
        { label:'PLT-02', data: rows.map(r => r.plt02), backgroundColor:'rgba(63,185,80,0.8)',   borderRadius:2 },
        { label:'PLT-03', data: rows.map(r => r.plt03), backgroundColor:'rgba(210,153,34,0.8)',  borderRadius:2 }
      ],
      totals: rows.map(r => r.total)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/projection/:id', (req, res) => {
  try {
    const db = getDB();
    const { plt01, plt02, plt03, total } = req.body;
    const merged = { plt01, plt02, plt03 };
    const computedTotal = total || Object.values(merged).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    db.prepare(`UPDATE revenue_projection SET plt01=COALESCE(?,plt01), plt02=COALESCE(?,plt02), plt03=COALESCE(?,plt03), total=?, updatedAt=datetime('now') WHERE id=?`)
      .run(plt01, plt02, plt03, computedTotal, req.params.id);
    res.json(db.prepare('SELECT * FROM revenue_projection WHERE id=?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
