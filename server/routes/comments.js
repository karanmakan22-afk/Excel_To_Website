// ============================================================
// server/routes/comments.js
// GET    /api/comments?entityType=risks&entityId=CR-01
// POST   /api/comments
// DELETE /api/comments/:id
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db = getDB();
    const { entityType, entityId } = req.query;
    let rows;
    if (entityType && entityId) {
      rows = db.prepare('SELECT * FROM comments WHERE entityType=? AND entityId=? ORDER BY id DESC').all(entityType, entityId);
    } else if (entityType) {
      rows = db.prepare('SELECT * FROM comments WHERE entityType=? ORDER BY id DESC').all(entityType);
    } else {
      rows = db.prepare('SELECT * FROM comments ORDER BY id DESC LIMIT 200').all();
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { entityType, entityId, comment, author } = req.body;
    if (!entityType || !entityId || !comment) {
      return res.status(400).json({ error: 'entityType, entityId and comment required' });
    }
    const info = db.prepare(`
      INSERT INTO comments (entityType, entityId, comment, author)
      VALUES (?,?,?,?)
    `).run(entityType, entityId, comment, author || req.user || 'User');
    res.status(201).json(db.prepare('SELECT * FROM comments WHERE id=?').get(info.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
