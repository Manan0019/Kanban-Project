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
    task_limit = null,
  } = req.body;

  db.query(
    "SELECT MAX(order_number) as max_order FROM project_status WHERE project_id = ?",
    [project_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const currentMax = rows[0].max_order || 0;
      const targetOrder = Math.min(Math.max(1, order_number), currentMax + 1);

      // Shift existing stages down to make room
      db.query(
        `UPDATE project_status SET order_number = order_number + 1
         WHERE project_id = ? AND order_number >= ?`,
        [project_id, targetOrder],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          db.query(
            `INSERT INTO project_status (project_id, status_name, order_number, is_completed, task_limit)
             VALUES (?, ?, ?, ?, ?)`,
            [project_id, status_name, targetOrder, is_completed, task_limit],
            (err3) => {
              if (err3) return res.status(500).json({ error: err3.message });
              res.status(201).json({ message: "Stage created", order_number: targetOrder });
            }
          );
        }
      );
    }
  );
});

// ================= REORDER STAGE =================
router.put("/reorder", (req, res) => {
  const { project_id, status_id, new_order } = req.body;

  const infoQuery = `
    SELECT 
      order_number, 
      (SELECT MAX(order_number) FROM project_status WHERE project_id = ?) as max_order 
    FROM project_status 
    WHERE status_id = ?
  `;

  db.query(infoQuery, [project_id, status_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ error: "Stage not found" });

    const old_order = rows[0].order_number;
    const max_order = rows[0].max_order;

    let target_order = Math.max(1, Number(new_order));
    target_order = Math.min(target_order, max_order);

    if (target_order === old_order) return res.json({ message: "No change needed" });

    let shiftQuery, shiftParams;

    if (target_order > old_order) {
      shiftQuery = `UPDATE project_status SET order_number = order_number - 1
                    WHERE project_id = ? AND order_number > ? AND order_number <= ?`;
      shiftParams = [project_id, old_order, target_order];
    } else {
      shiftQuery = `UPDATE project_status SET order_number = order_number + 1
                    WHERE project_id = ? AND order_number >= ? AND order_number < ?`;
      shiftParams = [project_id, target_order, old_order];
    }

    db.query(shiftQuery, shiftParams, (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.query(
        "UPDATE project_status SET order_number = ? WHERE status_id = ?",
        [target_order, status_id],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ message: "Reordered successfully" });
        }
      );
    });
  });
});

// ================= UPDATE STAGE (name, is_completed, task_limit) =================
router.put("/:statusId", (req, res) => {
  const { status_name, is_completed, task_limit } = req.body;

  // Build dynamic SET clause so partial updates are safe
  const fields = [];
  const values = [];

  if (status_name !== undefined) { fields.push("status_name = ?"); values.push(status_name); }
  if (is_completed !== undefined) { fields.push("is_completed = ?"); values.push(is_completed); }
  if (task_limit !== undefined) { fields.push("task_limit = ?"); values.push(task_limit); }

  if (!fields.length) return res.status(400).json({ error: "No fields to update" });

  values.push(req.params.statusId);

  db.query(
    `UPDATE project_status SET ${fields.join(", ")} WHERE status_id = ?`,
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
    "SELECT project_id, order_number FROM project_status WHERE status_id = ?",
    [statusId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!rows.length) return res.status(404).json({ error: "Stage not found" });

      const { project_id, order_number } = rows[0];

      db.query("DELETE FROM project_status WHERE status_id = ?", [statusId], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.query(
          `UPDATE project_status SET order_number = order_number - 1
           WHERE project_id = ? AND order_number > ?`,
          [project_id, order_number],
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