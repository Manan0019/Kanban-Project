const express = require("express");
const router  = express.Router();
const db      = require("../config/db");

// POST create task (supports is_priority and parent_task_id for subtasks)
router.post("/", (req, res) => {
  const { project_id, status_id, title, description, is_priority = 0, parent_task_id = null } = req.body;

  db.query(
    "SELECT COUNT(*) AS cnt FROM task WHERE status_id = ? AND parent_task_id IS NULL",
    [status_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const position = rows[0].cnt;

      db.query(
        `INSERT INTO task (project_id, status_id, title, description, position, is_priority, parent_task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [project_id, status_id, title, description, position, is_priority ? 1 : 0, parent_task_id || null],
        (err2, result) => {
          if (err2) return res.status(500).json({ error: err2.message });
          db.query("SELECT * FROM task WHERE task_id = ?", [result.insertId], (err3, r) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.status(201).json(r[0]);
          });
        }
      );
    }
  );
});

// GET tasks by project (only top-level tasks)
router.get("/project/:projectId", (req, res) => {
  db.query(
    `SELECT * FROM task WHERE project_id = ? AND parent_task_id IS NULL
     ORDER BY status_id ASC, COALESCE(position,0) ASC`,
    [req.params.projectId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// GET subtasks for a task
router.get("/:taskId/subtasks", (req, res) => {
  db.query(
    "SELECT * FROM task WHERE parent_task_id = ? ORDER BY created_at ASC",
    [req.params.taskId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// PUT /tasks/reorder — MUST come before /:taskId
router.put("/reorder", (req, res) => {
  const { tasks } = req.body;
  if (!tasks || !tasks.length) return res.json({ message: "Nothing to reorder" });

  const promises = tasks.map(({ task_id, status_id, position }) =>
    new Promise((resolve, reject) => {
      db.query(
        "UPDATE task SET status_id = ?, position = ? WHERE task_id = ?",
        [status_id, position, task_id],
        (err) => (err ? reject(err) : resolve())
      );
    })
  );

  Promise.all(promises)
    .then(() => res.json({ message: "Tasks reordered" }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

// PUT /tasks/:taskId/status
router.put("/:taskId/status", (req, res) => {
  const { status_id } = req.body;
  db.query(
    "UPDATE task SET status_id = ? WHERE task_id = ?",
    [status_id, req.params.taskId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Status updated" });
    }
  );
});

// PUT /tasks/:taskId
router.put("/:taskId", (req, res) => {
  const { title, description, is_priority } = req.body;
  const fields = [];
  const values = [];

  if (title       !== undefined) { fields.push("title = ?");       values.push(title); }
  if (description !== undefined) { fields.push("description = ?"); values.push(description); }
  if (is_priority !== undefined) { fields.push("is_priority = ?"); values.push(is_priority ? 1 : 0); }

  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  values.push(req.params.taskId);

  db.query(
    `UPDATE task SET ${fields.join(", ")} WHERE task_id = ?`,
    values,
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Task updated" });
    }
  );
});

// DELETE /tasks/:taskId (also deletes subtasks)
router.delete("/:taskId", (req, res) => {
  const tid = req.params.taskId;
  db.query("DELETE FROM task WHERE parent_task_id = ?", [tid], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.query("DELETE FROM task WHERE task_id = ?", [tid], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: "Task deleted" });
    });
  });
});

module.exports = router;