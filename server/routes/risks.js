// ============================================================
// server/routes/risks.js
// Full CRUD + chart-data endpoint
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

// GET all risks (optionally filtered by projectId)
router.get('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT * FROM risks WHERE projectId = ? ORDER BY id').all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET chart data — computed from live DB rows
router.get('/chart-data', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT * FROM risks WHERE projectId = ? ORDER BY id').all(pid);

    // Bubble chart data (likelihood vs impact)
    const bubbleData = rows
      .filter(r => r.likelihood != null && r.impact != null)
      .map(r => ({
        id:       r.riskId,
        label:    r.category,
        x:        r.likelihood,
        y:        r.impact,
        r:        Math.max(6, (r.score || 5) * 1.5),
        severity: r.severity,
        score:    r.score
      }));

    // Radar chart data (categories + scores)
    const radarData = rows
      .filter(r => r.score != null)
      .map(r => ({ label: r.category, score: r.score }));

    // Summary counts
    const summary = {
      critical: rows.filter(r => r.severity === 'Critical').length,
      high:     rows.filter(r => r.severity === 'High').length,
      medium:   rows.filter(r => r.severity === 'Medium').length,
      low:      rows.filter(r => r.severity === 'Low').length,
      worsening:rows.filter(r => r.trend === 'Worsening').length
    };

    res.json({ bubbleData, radarData, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single risk
router.get('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM risks WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Risk not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create risk
router.post('/', (req, res) => {
  try {
    const db = getDB();
    const {
      projectId = 'sanathan', riskId, category, plantsAffected = 'All Plants',
      statesAffected = 'Rajasthan, Karnataka', severity = 'Medium',
      likelihood, impact, score, description = '', regulatoryRef = '',
      mitigation = '', escalationTrigger = '', trend = 'Stable',
      lastReviewed = new Date().toLocaleDateString('en-IN'), status = 'Open'
    } = req.body;

    if (!riskId || !category) return res.status(400).json({ error: 'riskId and category required' });

    const computedScore = score || (likelihood && impact ? ((+likelihood + +impact) / 2).toFixed(1) : null);

    const info = db.prepare(`
      INSERT INTO risks (projectId, riskId, category, plantsAffected, statesAffected,
        severity, likelihood, impact, score, description, regulatoryRef,
        mitigation, escalationTrigger, trend, lastReviewed, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, riskId, category, plantsAffected, statesAffected,
           severity, likelihood, impact, computedScore, description, regulatoryRef,
           mitigation, escalationTrigger, trend, lastReviewed, status);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(projectId, `risks.${riskId}`, '', JSON.stringify(req.body), req.user || 'api');

    res.status(201).json(db.prepare('SELECT * FROM risks WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update risk — auto-recalculates score if likelihood/impact change
router.put('/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM risks WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Risk not found' });

    const fields = [
      'category','plantsAffected','statesAffected','severity',
      'likelihood','impact','score','description','regulatoryRef',
      'mitigation','escalationTrigger','trend','lastReviewed','status'
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    // Auto-compute score if likelihood or impact updated
    const merged = { ...old, ...req.body };
    if ((req.body.likelihood !== undefined || req.body.impact !== undefined) && req.body.score === undefined) {
      merged.score = ((+merged.likelihood + +merged.impact) / 2).toFixed(1);
      if (!updates.includes('score')) updates.push('score');
    }

    db.prepare(`UPDATE risks SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => merged[f]), req.params.id);

    // Log change
    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `risks.${old.riskId}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>merged[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM risks WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE risk
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    const row = db.prepare('SELECT * FROM risks WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Risk not found' });
    db.prepare('DELETE FROM risks WHERE id = ?').run(req.params.id);
    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(row.projectId, `risks.${row.riskId}`, 'DELETED', '', req.user || 'api');
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
