// ============================================================
// server/routes/plants.js
// GET  /api/plants?projectId=sanathan
// GET  /api/plants/:id
// PUT  /api/plants/:id
// POST /api/plants
// DELETE /api/plants/:id
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    const rows = db.prepare('SELECT * FROM plants WHERE projectId = ? ORDER BY id').all(pid);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db  = getDB();
    const row = db.prepare('SELECT * FROM plants WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Plant not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { projectId='sanathan', plantId, name, technology, city, state,
            mw=0, acMW=0, tariff=0, codTarget, plantMSG=0, p90MU=0,
            status='Pre-COD', risk='Pre-COD' } = req.body;
    if (!plantId || !name) return res.status(400).json({ error: 'plantId and name required' });

    const info = db.prepare(`
      INSERT INTO plants (projectId, plantId, name, technology, city, state,
        mw, acMW, tariff, codTarget, plantMSG, p90MU, status, risk)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(projectId, plantId, name, technology, city, state,
           mw, acMW, tariff, codTarget, plantMSG, p90MU, status, risk);

    res.status(201).json(db.prepare('SELECT * FROM plants WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const fields = ['name','technology','city','state','mw','acMW','tariff',
                    'codTarget','plantMSG','p90MU','status','risk'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    db.prepare(`UPDATE plants SET ${updates.map(f=>`${f}=?`).join(',')}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    res.json(db.prepare('SELECT * FROM plants WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM plants WHERE id = ?').run(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
