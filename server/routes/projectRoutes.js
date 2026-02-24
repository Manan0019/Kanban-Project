const express = require("express");
const router  = express.Router();
const db      = require("../config/db");

/* ================================================================
   PROJECTS
   ================================================================ */

// GET all projects
router.get("/", (req, res) => {
  db.query("SELECT * FROM projects ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST create project with custom stages
router.post("/", (req, res) => {
  const { project_name, description, start_date, end_date, stages } = req.body;
  if (!project_name || !project_name.trim()) {
    return res.status(400).json({ error: "project_name is required" });
  }

  db.query(
    "INSERT INTO projects (name, description, start_date, end_date) VALUES (?, ?, ?, ?)",
    [project_name.trim(), description || "", start_date || null, end_date || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const pid = result.insertId;

      const stageRows = (stages && stages.length > 0) ? stages : [
        { status_name: "Pending",     is_pending: 1, is_completed: 0, task_limit: null },
        { status_name: "In Progress", is_pending: 0, is_completed: 0, task_limit: null },
        { status_name: "Completed",   is_pending: 0, is_completed: 1, task_limit: null },
      ];

      const values = stageRows.map((s, i) => [
        pid, s.status_name, i + 1, s.is_completed ? 1 : 0, s.task_limit || null, s.is_pending ? 1 : 0,
      ]);
      const placeholders = values.map(() => "(?,?,?,?,?,?)").join(",");
      const flat = values.flat();

      db.query(
        `INSERT INTO stages (project_id, name, position, is_completed, task_limit, is_pending) VALUES ${placeholders}`,
        flat,
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.status(201).json({ project_id: pid, message: "Project created" });
        }
      );
    }
  );
});

// PUT /projects/:projectId — edit project details
router.put("/:projectId", (req, res) => {
  const { project_name, description, start_date, end_date } = req.body;
  const fields = [];
  const values = [];

  if (project_name !== undefined) { fields.push("name = ?");        values.push(project_name.trim()); }
  if (description  !== undefined) { fields.push("description = ?"); values.push(description); }
  if (start_date   !== undefined) { fields.push("start_date = ?");   values.push(start_date || null); }
  if (end_date     !== undefined) { fields.push("end_date = ?");     values.push(end_date || null); }

  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  values.push(req.params.projectId);

  db.query(
    `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
    values,
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Project updated" });
    }
  );
});

// DELETE /projects/:projectId — cascade handled by FK, but manual for safety
router.delete("/:projectId", (req, res) => {
  const pid = req.params.projectId;
  db.query("DELETE FROM tasks WHERE project_id = ?", [pid], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.query("DELETE FROM stages WHERE project_id = ?", [pid], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.query("DELETE FROM projects WHERE id = ?", [pid], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ message: "Project deleted" });
      });
    });
  });
});

/* ================================================================
   STAGES  (nested under /projects/:projectId/stages)
   ================================================================ */

router.get("/:projectId/stages", (req, res) => {
  db.query(
    "SELECT * FROM stages WHERE project_id = ? ORDER BY position ASC",
    [req.params.projectId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// MUST be before /:projectId/stages/:stageId
router.put("/:projectId/stages/reorder", (req, res) => {
  const { stages } = req.body;
  if (!stages || !stages.length) return res.json({ message: "Nothing to reorder" });

  const promises = stages.map(({ id, position }) =>
    new Promise((resolve, reject) => {
      db.query(
        "UPDATE stages SET position = ? WHERE id = ? AND project_id = ?",
        [position, id, req.params.projectId],
        (err) => (err ? reject(err) : resolve())
      );
    })
  );

  Promise.all(promises)
    .then(() => res.json({ message: "Stages reordered" }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

router.post("/:projectId/stages", (req, res) => {
  const pid = req.params.projectId;
  const { status_name, is_completed = false, is_pending = false, task_limit = null } = req.body;
  const rawPosition = req.body.position || req.body.order_number;

  if (!status_name || !status_name.trim()) {
    return res.status(400).json({ error: "status_name is required" });
  }

  db.query("SELECT MAX(position) AS mx FROM stages WHERE project_id = ?", [pid], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const max = rows[0]?.mx != null ? Number(rows[0].mx) : 0;
    const parsed = parseInt(rawPosition, 10);
    const target = !isNaN(parsed) && parsed >= 1 ? Math.min(parsed, max + 1) : max + 1;

    db.query(
      "UPDATE stages SET position = position + 1 WHERE project_id = ? AND position >= ?",
      [pid, target],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.query(
          `INSERT INTO stages (project_id, name, position, is_completed, task_limit, is_pending) VALUES (?, ?, ?, ?, ?, ?)`,
          [pid, status_name.trim(), target, is_completed ? 1 : 0, task_limit || null, is_pending ? 1 : 0],
          (err3, result) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.status(201).json({ id: result.insertId, position: target });
          }
        );
      }
    );
  });
});

router.put("/:projectId/stages/:stageId", (req, res) => {
  const { stageId, projectId } = req.params;
  const { status_name, is_completed, is_pending, task_limit } = req.body;
  const fields = [];
  const values = [];

  if (status_name  !== undefined) { fields.push("name = ?");         values.push(status_name.trim()); }
  if (is_completed !== undefined) { fields.push("is_completed = ?"); values.push(is_completed ? 1 : 0); }
  if (is_pending   !== undefined) { fields.push("is_pending = ?");   values.push(is_pending ? 1 : 0); }
  if (task_limit   !== undefined) { fields.push("task_limit = ?");   values.push(task_limit || null); }

  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  values.push(stageId, projectId);

  db.query(
    `UPDATE stages SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`,
    values,
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Stage updated" });
    }
  );
});

router.delete("/:projectId/stages/:stageId", (req, res) => {
  const { stageId, projectId } = req.params;

  db.query(
    "SELECT position FROM stages WHERE id = ? AND project_id = ?",
    [stageId, projectId],
    (err, rows) => {
      if (err)          return res.status(500).json({ error: err.message });
      if (!rows.length) return res.status(404).json({ error: "Stage not found" });

      const { position } = rows[0];
      db.query("DELETE FROM stages WHERE id = ?", [stageId], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.query(
          "UPDATE stages SET position = position - 1 WHERE project_id = ? AND position > ?",
          [projectId, position],
          (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.json({ message: "Stage deleted" });
          }
        );
      });
    }
  );
});

module.exports = router;