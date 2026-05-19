// ============================================================
// server/routes/history.js
// GET  /api/history         — paginated change log
// DELETE /api/history       — clear all history
// ============================================================

const express   = require('express');
const router    = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db    = getDB();
    const pid   = req.query.projectId || 'sanathan';
    const limit = parseInt(req.query.limit) || 100;
    const rows  = db.prepare(`
      SELECT * FROM change_history
      WHERE projectId = ? OR projectId IS NULL
      ORDER BY id DESC LIMIT ?
    `).all(pid, limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.query.projectId || 'sanathan';
    db.prepare('DELETE FROM change_history WHERE projectId = ?').run(pid);
    res.json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
