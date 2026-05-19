// ============================================================
// server/routes/projects.js
// GET /api/projects
// GET /api/projects/:projectId
// PUT /api/projects/:projectId
// ============================================================

const express = require('express');
const router  = express.Router();
const { getDB } = require('../database');

// GET all projects
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const projects = db.prepare('SELECT * FROM projects ORDER BY id').all();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single project with plants
router.get('/:projectId', (req, res) => {
  try {
    const db = getDB();
    const project = db.prepare('SELECT * FROM projects WHERE projectId = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const plants = db.prepare('SELECT * FROM plants WHERE projectId = ? ORDER BY id').all(req.params.projectId);
    res.json({ ...project, plants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update project
router.put('/:projectId', (req, res) => {
  try {
    const db  = getDB();
    const pid = req.params.projectId;
    const fields = [
      'name','client','totalMW','blendedTariff','annualMSG',
      'annualRevBudget','lifetimeRev','npv8','psaTerm',
      'psaStart','psaEnd','codDate','status','complianceScore','technology'
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    const sql = `UPDATE projects SET ${updates.map(f => `${f} = ?`).join(', ')}, updatedAt = datetime('now') WHERE projectId = ?`;
    db.prepare(sql).run(...updates.map(f => req.body[f]), pid);

    // Log change
    db.prepare(`INSERT INTO change_history (projectId, field, oldVal, newVal, author) VALUES (?,?,?,?,?)`)
      .run(pid, `project.${updates.join(',')}`, '', JSON.stringify(req.body), req.user || 'api');

    const updated = db.prepare('SELECT * FROM projects WHERE projectId = ?').get(pid);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
