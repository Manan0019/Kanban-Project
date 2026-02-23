const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ================= CREATE STAGE =================
router.post("/", (req, res) => {
  const { project_id, status_name, order_number, is_completed = false } = req.body;

  // 1. First, check the maximum order number to prevent gaps
  db.query(
    "SELECT MAX(order_number) as max_order FROM project_status WHERE project_id = ?",
    [project_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const currentMax = rows[0].max_order || 0;
      // Ensure the requested order isn't higher than the next available slot
      const targetOrder = Math.min(Math.max(1, order_number), currentMax + 1);

      // 2. Shift stages down to make room
      const shiftQuery = `
        UPDATE project_status
        SET order_number = order_number + 1
        WHERE project_id = ? AND order_number >= ?
      `;

      db.query(shiftQuery, [project_id, targetOrder], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // 3. Insert the new stage
        const insertQuery = `
          INSERT INTO project_status (project_id, status_name, order_number, is_completed)
          VALUES (?, ?, ?, ?)
        `;

        db.query(
          insertQuery,
          [project_id, status_name, targetOrder, is_completed],
          (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.status(201).json({ message: "Stage created", order_number: targetOrder });
          }
        );
      });
    }
  );
});

// ================= REORDER STAGE =================
router.put("/reorder", (req, res) => {
  const { project_id, status_id, new_order } = req.body;

  // 1. Get current order AND the maximum order in one query
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

    // Cap the target order so it can't be less than 1 or greater than the max number of stages
    let target_order = Math.max(1, Number(new_order));
    target_order = Math.min(target_order, max_order);

    if (target_order === old_order) {
      return res.json({ message: "No change needed" });
    }

    let shiftQuery = "";
    let shiftParams = [];

    // 2. Determine shift direction
    if (target_order > old_order) {
      // Shifting right/down: Move items between old and new position left/up
      shiftQuery = `
        UPDATE project_status
        SET order_number = order_number - 1
        WHERE project_id = ? AND order_number > ? AND order_number <= ?
      `;
      shiftParams = [project_id, old_order, target_order];
    } else {
      // Shifting left/up: Move items between new and old position right/down
      shiftQuery = `
        UPDATE project_status
        SET order_number = order_number + 1
        WHERE project_id = ? AND order_number >= ? AND order_number < ?
      `;
      shiftParams = [project_id, target_order, old_order];
    }

    // 3. Execute shift
    db.query(shiftQuery, shiftParams, (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // 4. Set the new order for the targeted stage
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

// ================= UPDATE STAGE NAME =================
router.put("/:statusId", (req, res) => {
  const { status_name } = req.body;

  db.query(
    "UPDATE project_status SET status_name = ? WHERE status_id = ?",
    [status_name, req.params.statusId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Stage updated successfully" });
    }
  );
});

// ================= DELETE STAGE =================
router.delete("/:statusId", (req, res) => {
  const { statusId } = req.params;

  // 1. Get stage info
  db.query(
    "SELECT project_id, order_number FROM project_status WHERE status_id = ?",
    [statusId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!rows.length) return res.status(404).json({ error: "Stage not found" });

      const { project_id, order_number } = rows[0];

      // 2. Delete stage
      db.query(
        "DELETE FROM project_status WHERE status_id = ?",
        [statusId],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          // 3. Shift remaining stages up to close the gap
          const shiftQuery = `
            UPDATE project_status
            SET order_number = order_number - 1
            WHERE project_id = ? AND order_number > ?
          `;

          db.query(shiftQuery, [project_id, order_number], (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            res.json({ message: "Stage deleted successfully" });
          });
        }
      );
    }
  );
});



module.exports = router;