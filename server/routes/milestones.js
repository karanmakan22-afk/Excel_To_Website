// ============================================================
// server/routes/milestones.js
// Full CRUD + chart-data endpoint for milestone tracker
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT * FROM milestones WHERE projectId = ? ORDER BY id').all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chart data — horizontal bar chart of % complete per milestone
router.get('/chart-data', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare(`
      SELECT msId, category, pctComplete, status, priority
      FROM milestones WHERE projectId = ? ORDER BY id LIMIT 16
    `).all(pid);

    const summary = {
      total:      rows.length,
      completed:  rows.filter(r => r.status === 'Completed').length,
      inProgress: rows.filter(r => r.status === 'In Progress').length,
      atRisk:     rows.filter(r => r.status === 'At Risk').length,
      upcoming:   rows.filter(r => r.status === 'Upcoming').length,
      critical:   rows.filter(r => r.priority === 'Critical').length
    };

    // Color coding by status
    const colors = rows.map(r => {
      if (r.status === 'Completed')   return 'rgba(63,185,80,0.7)';
      if (r.status === 'At Risk')     return 'rgba(248,81,73,0.7)';
      if (r.status === 'In Progress') return 'rgba(72,161,199,0.7)';
      return 'rgba(139,148,158,0.4)';
    });

    res.json({
      labels:      rows.map(r => r.msId),
      categories:  rows.map(r => r.category),
      pctComplete: rows.map(r => r.pctComplete || 0),
      colors,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Milestone not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDB();
    const {
      projectId='sanathan', msId, plantId='All Plants', category,
      description='', psaRef='', plannedDate='TBD', pctComplete=0,
      status='Upcoming', consequence='', responsible='TBD',
      dueBy='—', priority='Medium'
    } = req.body;
    if (!msId || !category) return res.status(400).json({ error: 'msId and category required' });

    const info = db.prepare(`
      INSERT INTO milestones
        (projectId, msId, plantId, category, description, psaRef,
         plannedDate, pctComplete, status, consequence, responsible, dueBy, priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, msId, plantId, category, description, psaRef,
           plannedDate, pctComplete, status, consequence, responsible, dueBy, priority);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(projectId, `milestones.${msId}`, '', JSON.stringify(req.body), req.user || 'api');

    res.status(201).json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Milestone not found' });

    const fields = ['plantId','category','description','psaRef','plannedDate',
                    'pctComplete','status','consequence','responsible','dueBy','priority'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    db.prepare(`UPDATE milestones SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `milestones.${old.msId}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>req.body[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Milestone not found' });
    db.prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id);
    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(row.projectId, `milestones.${row.msId}`, 'DELETED', '', req.user || 'api');
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
