const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ================= CREATE STAGE =================
router.post("/", (req, res) => {
  const {
    project_id,
    status_name,
    order_number,
    is_completed = false,
    is_pending = false,
    task_limit = null,
  } = req.body;

  db.query(
    "SELECT MAX(position) as max_order FROM stages WHERE project_id = ?",
    [project_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const currentMax = rows[0].max_order || 0;
      const targetOrder = Math.min(Math.max(1, order_number), currentMax + 1);

      db.query(
        `UPDATE stages SET position = position + 1
         WHERE project_id = ? AND position >= ?`,
        [project_id, targetOrder],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          db.query(
            `INSERT INTO stages (project_id, name, position, is_completed, task_limit, is_pending)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [project_id, status_name, targetOrder, is_completed ? 1 : 0, task_limit, is_pending ? 1 : 0],
            (err3, result) => {
              if (err3) return res.status(500).json({ error: err3.message });
              res.status(201).json({ message: "Stage created", id: result.insertId, position: targetOrder });
            }
          );
        }
      );
    }
  );
});

// ================= REORDER STAGE =================
router.put("/reorder", (req, res) => {
  const { project_id, id, new_order } = req.body;

  const infoQuery = `
    SELECT 
      position, 
      (SELECT MAX(position) FROM stages WHERE project_id = ?) as max_order 
    FROM stages 
    WHERE id = ?
  `;

  db.query(infoQuery, [project_id, id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ error: "Stage not found" });

    const old_order = rows[0].position;
    const max_order = rows[0].max_order;

    let target_order = Math.max(1, Number(new_order));
    target_order = Math.min(target_order, max_order);

    if (target_order === old_order) return res.json({ message: "No change needed" });

    let shiftQuery, shiftParams;

    if (target_order > old_order) {
      shiftQuery = `UPDATE stages SET position = position - 1
                    WHERE project_id = ? AND position > ? AND position <= ?`;
      shiftParams = [project_id, old_order, target_order];
    } else {
      shiftQuery = `UPDATE stages SET position = position + 1
                    WHERE project_id = ? AND position >= ? AND position < ?`;
      shiftParams = [project_id, target_order, old_order];
    }

    db.query(shiftQuery, shiftParams, (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.query(
        "UPDATE stages SET position = ? WHERE id = ?",
        [target_order, id],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ message: "Reordered successfully" });
        }
      );
    });
  });
});

// ================= UPDATE STAGE =================
router.put("/:statusId", (req, res) => {
  const { status_name, is_completed, is_pending, task_limit } = req.body;

  const fields = [];
  const values = [];

  if (status_name  !== undefined) { fields.push("name = ?");         values.push(status_name); }
  if (is_completed !== undefined) { fields.push("is_completed = ?"); values.push(is_completed ? 1 : 0); }
  if (is_pending   !== undefined) { fields.push("is_pending = ?");   values.push(is_pending ? 1 : 0); }
  if (task_limit   !== undefined) { fields.push("task_limit = ?");   values.push(task_limit); }

  if (!fields.length) return res.status(400).json({ error: "No fields to update" });

  values.push(req.params.statusId);

  db.query(
    `UPDATE stages SET ${fields.join(", ")} WHERE id = ?`,
    values,
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Stage updated successfully" });
    }
  );
});

// ================= DELETE STAGE =================
router.delete("/:statusId", (req, res) => {
  const { statusId } = req.params;

  db.query(
    "SELECT project_id, position FROM stages WHERE id = ?",
    [statusId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!rows.length) return res.status(404).json({ error: "Stage not found" });

      const { project_id, position } = rows[0];

      db.query("DELETE FROM stages WHERE id = ?", [statusId], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.query(
          `UPDATE stages SET position = position - 1
           WHERE project_id = ? AND position > ?`,
          [project_id, position],
          (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.json({ message: "Stage deleted successfully" });
          }
        );
      });
    }
  );
});

module.exports = router;