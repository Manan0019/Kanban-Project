const express = require("express");
const router  = express.Router();
const db      = require("../config/db");

/* ================================================================
   PROJECTS
   ================================================================ */

// GET all projects
router.get("/", (req, res) => {
  db.query("SELECT * FROM project ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST create project  (also inserts 3 default stages)
router.post("/", (req, res) => {
  const { project_name, description } = req.body;
  db.query(
    "INSERT INTO project (project_name, description) VALUES (?, ?)",
    [project_name, description],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const pid = result.insertId;
      db.query(
        `INSERT INTO project_status (project_id, status_name, order_number, is_completed, task_limit)
         VALUES (?,  'Pending',     1, 0, NULL),
                (?,  'In Progress', 2, 0, NULL),
                (?,  'Completed',   3, 1, NULL)`,
        [pid, pid, pid],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.status(201).json({ project_id: pid, message: "Project created" });
        }
      );
    }
  );
});

/* ================================================================
   STAGES  (nested under /projects/:projectId/stages)
   ================================================================ */

// GET all stages for a project
router.get("/:projectId/stages", (req, res) => {
  db.query(
    "SELECT * FROM project_status WHERE project_id = ? ORDER BY order_number ASC",
    [req.params.projectId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ── PUT  /projects/:projectId/stages/reorder  ──────────────────────────────
// Body: { stages: [{ status_id, order_number }, …] }
// Must be declared BEFORE  /:projectId/stages/:stageId  so Express matches it first.
router.put("/:projectId/stages/reorder", (req, res) => {
  const { stages } = req.body;
  if (!stages || !stages.length) return res.json({ message: "Nothing to reorder" });

  const promises = stages.map(
    ({ status_id, order_number }) =>
      new Promise((resolve, reject) => {
        db.query(
          "UPDATE project_status SET order_number = ? WHERE status_id = ? AND project_id = ?",
          [order_number, status_id, req.params.projectId],
          (err) => (err ? reject(err) : resolve())
        );
      })
  );

  Promise.all(promises)
    .then(() => res.json({ message: "Stages reordered" }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

// ── POST  /projects/:projectId/stages  ────────────────────────────────────
router.post("/:projectId/stages", (req, res) => {
  const pid = req.params.projectId;
  const { status_name, order_number, is_completed = false, task_limit = null } = req.body;

  db.query(
    "SELECT MAX(order_number) AS mx FROM project_status WHERE project_id = ?",
    [pid],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const max        = rows[0].mx ?? 0;
      const target     = Math.min(Math.max(1, Number(order_number) || max + 1), max + 1);

      // Shift existing stages down to make room
      db.query(
        "UPDATE project_status SET order_number = order_number + 1 WHERE project_id = ? AND order_number >= ?",
        [pid, target],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          db.query(
            `INSERT INTO project_status
               (project_id, status_name, order_number, is_completed, task_limit)
             VALUES (?, ?, ?, ?, ?)`,
            [pid, status_name, target, is_completed ? 1 : 0, task_limit],
            (err3, result) => {
              if (err3) return res.status(500).json({ error: err3.message });
              res.status(201).json({ status_id: result.insertId, order_number: target });
            }
          );
        }
      );
    }
  );
});

// ── PUT  /projects/:projectId/stages/:stageId  ────────────────────────────
// Updates name, is_completed, task_limit.  Does NOT touch order_number here
// (use the /reorder endpoint for that).
router.put("/:projectId/stages/:stageId", (req, res) => {
  const { stageId, projectId } = req.params;
  const { status_name, is_completed, task_limit } = req.body;

  const fields = [];
  const values = [];

  if (status_name  !== undefined) { fields.push("status_name = ?");  values.push(status_name); }
  if (is_completed !== undefined) { fields.push("is_completed = ?"); values.push(is_completed ? 1 : 0); }
  if (task_limit   !== undefined) { fields.push("task_limit = ?");   values.push(task_limit); }

  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });

  values.push(stageId, projectId);

  db.query(
    `UPDATE project_status SET ${fields.join(", ")} WHERE status_id = ? AND project_id = ?`,
    values,
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Stage updated" });
    }
  );
});

// ── DELETE  /projects/:projectId/stages/:stageId  ────────────────────────
router.delete("/:projectId/stages/:stageId", (req, res) => {
  const { stageId, projectId } = req.params;

  db.query(
    "SELECT order_number FROM project_status WHERE status_id = ? AND project_id = ?",
    [stageId, projectId],
    (err, rows) => {
      if (err)          return res.status(500).json({ error: err.message });
      if (!rows.length) return res.status(404).json({ error: "Stage not found" });

      const { order_number } = rows[0];

      db.query("DELETE FROM project_status WHERE status_id = ?", [stageId], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Close the gap
        db.query(
          "UPDATE project_status SET order_number = order_number - 1 WHERE project_id = ? AND order_number > ?",
          [projectId, order_number],
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