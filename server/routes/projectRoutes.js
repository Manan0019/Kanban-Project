const express = require("express");
const router = express.Router();
const db = require("../config/db");

// CREATE PROJECT
router.post("/", (req, res) => {
    const { project_name, description } = req.body;

    const projectQuery = "INSERT INTO project (project_name, description) VALUES (?, ?)";

    db.query(projectQuery, [project_name, description], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const projectId = result.insertId;

        // Insert default stages
        const statusQuery = `
            INSERT INTO project_status (project_id, status_name, order_number, is_completed)
            VALUES 
            (?, 'Pending', 1, FALSE),
            (?, 'In Progress', 2, FALSE),
            (?, 'Completed', 3, TRUE)
        `;

        db.query(statusQuery, [projectId, projectId, projectId], (err2) => {
            if (err2) {
                return res.status(500).json({ error: err2.message });
            }

            res.status(201).json({ message: "Project created successfully with default stages" });
        });
    });
});

// GET ALL PROJECTS
router.get("/", (req, res) => {
    const query = "SELECT * FROM project ORDER BY created_at DESC";

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(results);
    });
});

// GET STAGES FOR A PROJECT
router.get("/:projectId/stages", (req, res) => {
    const { projectId } = req.params;

    const query = `
        SELECT * FROM project_status
        WHERE project_id = ?
        ORDER BY order_number ASC
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(results);
    });
});


module.exports = router;
