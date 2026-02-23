const express = require("express");
const router = express.Router();
const db = require("../config/db");

// CREATE TASK
router.post("/", (req, res) => {
  const { project_id, status_id, title, description } = req.body;

  const insertQuery = `
    INSERT INTO task (project_id, status_id, title, description)
    VALUES (?, ?, ?, ?)
  `;

  db.query(
    insertQuery,
    [project_id, status_id, title, description],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const newTaskId = result.insertId;

      const selectQuery = `
        SELECT * FROM task WHERE task_id = ?
      `;

      db.query(selectQuery, [newTaskId], (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });

        res.status(201).json(rows[0]); // return full task object
      });
    }
  );
});

// GET TASKS BY PROJECT
router.get("/project/:projectId", (req, res) => {
    const { projectId } = req.params;

    const query = `
        SELECT * FROM task
        WHERE project_id = ?
        ORDER BY status_id, position ASC
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(results);
    });
});

// UPDATE TASK STATUS
router.put("/:taskId/status", (req, res) => {
    const { taskId } = req.params;
    const { status_id } = req.body;

    const query = `
        UPDATE task
        SET status_id = ?
        WHERE task_id = ?
    `;

    db.query(query, [status_id, taskId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({ message: "Task status updated successfully" });
    });
});

// DELETE TASK
router.delete("/:taskId", (req, res) => {
    const { taskId } = req.params;

    const query = `
        DELETE FROM task
        WHERE task_id = ?
    `;

    db.query(query, [taskId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({ message: "Task deleted successfully" });
    });
});

// UPDATE TASK
router.put("/:taskId", (req, res) => {
    const { taskId } = req.params;
    const { title, description } = req.body;

    const query = `
        UPDATE task
        SET title = ?, description = ?
        WHERE task_id = ?
    `;

    db.query(query, [title, description, taskId], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ message: "Task updated successfully" });
    });
});

// UPDATE TASK POSITION + STATUS
router.put("/reorder", (req, res) => {
    const { tasks } = req.body;

    const updatePromises = tasks.map((task) => {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE task
                SET status_id = ?, position = ?
                WHERE task_id = ?
            `;

            db.query(query, [task.status_id, task.position, task.task_id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    Promise.all(updatePromises)
        .then(() => res.json({ message: "Tasks reordered successfully" }))
        .catch((err) => res.status(500).json({ error: err.message }));
});

module.exports = router;
