// ============================================================
// server/routes/postcod.js
// Full CRUD for post COD tracker
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare(`
      SELECT * FROM postcod WHERE projectId = ?
      ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
    `).all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// KPI summary for dashboard
router.get('/summary', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN priority='Critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN status='At Risk'    THEN 1 ELSE 0 END) as atRisk,
        SUM(CASE WHEN status='In Progress'THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN status='Completed'  THEN 1 ELSE 0 END) as completed
      FROM postcod WHERE projectId = ?
    `).get(pid);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM postcod WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Post-COD item not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDB();
    const {
      projectId='sanathan', pcId, plantId='All Plants',
      state='Rajasthan, Karnataka', category, description='', psaRef='',
      plannedDate='TBD', actualRevised='TBD', pctComplete=0, status='Upcoming',
      consequence='', responsible='TBD', nextAction='—', dueBy='—', priority='Medium'
    } = req.body;
    if (!pcId || !category) return res.status(400).json({ error: 'pcId and category required' });

    const info = db.prepare(`
      INSERT INTO postcod
        (projectId, pcId, plantId, state, category, description, psaRef,
         plannedDate, actualRevised, pctComplete, status, consequence,
         responsible, nextAction, dueBy, priority)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, pcId, plantId, state, category, description, psaRef,
           plannedDate, actualRevised, pctComplete, status, consequence,
           responsible, nextAction, dueBy, priority);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(projectId, `postcod.${pcId}`, '', JSON.stringify(req.body), req.user || 'api');

    res.status(201).json(db.prepare('SELECT * FROM postcod WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db  = getDB();
    const old = db.prepare('SELECT * FROM postcod WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'Post-COD item not found' });

    const fields = ['plantId','state','category','description','psaRef','plannedDate',
                    'actualRevised','pctComplete','status','consequence',
                    'responsible','nextAction','dueBy','priority'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    db.prepare(`UPDATE postcod SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(old.projectId, `postcod.${old.pcId}.${updates.join(',')}`,
           updates.map(f=>old[f]).join('|'), updates.map(f=>req.body[f]).join('|'), req.user || 'api');

    res.json(db.prepare('SELECT * FROM postcod WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM postcod WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Post-COD item not found' });
    db.prepare('DELETE FROM postcod WHERE id = ?').run(req.params.id);
    db.prepare('INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)')
      .run(row.projectId, `postcod.${row.pcId}`, 'DELETED', '', req.user || 'api');
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
