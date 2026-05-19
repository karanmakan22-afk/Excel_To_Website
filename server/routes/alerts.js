// ============================================================
// server/routes/alerts.js
// Full CRUD for alerts & open actions
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare(`
      SELECT * FROM alerts WHERE projectId = ?
      ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
    `).all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary counts for dashboard KPIs
router.get('/summary', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN priority='Critical' AND status='Open' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN priority='High'     AND status='Open' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN priority='Medium'   AND status='Open' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN priority='Low'      AND status='Open' THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN status='Open'                         THEN 1 ELSE 0 END) as totalOpen
      FROM alerts WHERE projectId = ?
    `).get(pid);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Alert not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDB();
    const {
      projectId='sanathan', alertId, priority='High', plantId='All',
      plant='SRI33PL', category, description='', psaRef='', raised='',
      actionRequired='', owner='', targetDate='', escalation='L1',
      status='Open', impact='', linkedMS=''
    } = req.body;
    if (!alertId || !category) return res.status(400).json({ error: 'alertId and category required' });

    const info = db.prepare(`
      INSERT INTO alerts
        (projectId, alertId, priority, plantId, plant, category, description,
         psaRef, raised, actionRequired, owner, targetDate, escalation, status, impact, linkedMS)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, alertId, priority, plantId, plant, category, description,
           psaRef, raised, actionRequired, owner, targetDate, escalation, status, impact, linkedMS);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(projectId, `alerts.${alertId}`, '', JSON.stringify(req.body), req.user || 'api');

    res.status(201).json(db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Alert not found' });

    const fields = ['priority','plantId','plant','category','description','psaRef',
                    'raised','actionRequired','owner','targetDate','escalation','status','impact','linkedMS'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    db.prepare(`UPDATE alerts SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `alerts.${old.alertId}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>req.body[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Alert not found' });
    db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(row.projectId, `alerts.${row.alertId}`, 'DELETED', '', req.user || 'api');
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
