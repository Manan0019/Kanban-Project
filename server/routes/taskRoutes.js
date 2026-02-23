const express = require("express");
const router  = express.Router();
const db      = require("../config/db");

/* ================================================================
   IMPORTANT: /reorder must be registered BEFORE  /:taskId
   otherwise Express matches the literal string "reorder" as
   a taskId param and the route is never reached.
   ================================================================ */

// POST  create task
router.post("/", (req, res) => {
  const { project_id, status_id, title, description } = req.body;

  // New tasks get position = (count of tasks in that column)
  db.query(
    "SELECT COUNT(*) AS cnt FROM task WHERE status_id = ?",
    [status_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const position = rows[0].cnt;   // 0-based, appended at end

      db.query(
        "INSERT INTO task (project_id, status_id, title, description, position) VALUES (?, ?, ?, ?, ?)",
        [project_id, status_id, title, description, position],
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

// GET  tasks by project  — ordered by position so reload restores sequence
router.get("/project/:projectId", (req, res) => {
  db.query(
    "SELECT * FROM task WHERE project_id = ? ORDER BY status_id ASC, COALESCE(position,0) ASC",
    [req.params.projectId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// PUT  /tasks/reorder   — bulk update position+status_id for all tasks
// *** MUST come before  /:taskId  ***
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

// PUT  /tasks/:taskId/status
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

// PUT  /tasks/:taskId   — edit title & description
router.put("/:taskId", (req, res) => {
  const { title, description } = req.body;
  db.query(
    "UPDATE task SET title = ?, description = ? WHERE task_id = ?",
    [title, description, req.params.taskId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Task updated" });
    }
  );
});

// DELETE  /tasks/:taskId
router.delete("/:taskId", (req, res) => {
  db.query("DELETE FROM task WHERE task_id = ?", [req.params.taskId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Task deleted" });
  });
});

module.exports = router;