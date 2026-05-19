// ============================================================
// server/routes/compliance.js
// Full CRUD for regulatory compliance register + chart data
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT * FROM compliance WHERE projectId = ? ORDER BY id').all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chart data — scores array ready for Chart.js
router.get('/chart-data', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT refId, area, status, score FROM compliance WHERE projectId = ? ORDER BY id').all(pid);

    const avg = rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0;
    const statusCounts = {
      compliant: rows.filter(r => r.status === 'Compliant' || r.status === 'Continuous').length,
      atRisk:    rows.filter(r => r.status === 'At Risk').length,
      pending:   rows.filter(r => r.status === 'Pending').length
    };

    res.json({
      labels:  rows.map(r => r.refId),
      areas:   rows.map(r => r.area),
      scores:  rows.map(r => r.score),
      statuses:rows.map(r => r.status),
      avg:     parseFloat(avg.toFixed(1)),
      statusCounts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compliance snapshot (dashboard tiles)
router.get('/snapshot', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT * FROM compliance_snapshot WHERE projectId = ? ORDER BY id').all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update snapshot item
router.put('/snapshot/:id', (req, res) => {
  try {
    const db = getDB();
    const { status, score } = req.body;
    db.prepare(`UPDATE compliance_snapshot SET status=COALESCE(?,status), score=COALESCE(?,score), updatedAt=datetime('now') WHERE id=?`)
      .run(status, score, req.params.id);
    res.json(db.prepare('SELECT * FROM compliance_snapshot WHERE id=?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM compliance WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Compliance item not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDB();
    const {
      projectId='sanathan', refId, area, law='', plantsText='All',
      requirement='', status='Compliant', score=0, frequency='Annual',
      lastAudit='—', nextAudit='—', responsible='', action='',
      owner='', targetDate='—'
    } = req.body;
    if (!refId || !area) return res.status(400).json({ error: 'refId and area required' });

    const info = db.prepare(`
      INSERT INTO compliance
        (projectId, refId, area, law, plantsText, requirement, status, score,
         frequency, lastAudit, nextAudit, responsible, action, owner, targetDate)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, refId, area, law, plantsText, requirement, status, score,
           frequency, lastAudit, nextAudit, responsible, action, owner, targetDate);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(projectId, `compliance.${refId}`, '', JSON.stringify(req.body), req.user || 'api');

    res.status(201).json(db.prepare('SELECT * FROM compliance WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM compliance WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Compliance item not found' });

    const fields = ['area','law','plantsText','requirement','status','score',
                    'frequency','lastAudit','nextAudit','responsible','action','owner','targetDate'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    db.prepare(`UPDATE compliance SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `compliance.${old.refId}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>req.body[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM compliance WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM compliance WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Compliance item not found' });
    db.prepare('DELETE FROM compliance WHERE id = ?').run(req.params.id);
    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(row.projectId, `compliance.${row.refId}`, 'DELETED', '', req.user || 'api');
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
