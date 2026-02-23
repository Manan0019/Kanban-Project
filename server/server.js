const express = require("express");
const cors = require("cors");

const db = require("./config/db");
const projectRoutes = require("./routes/projectRoutes");
const taskRoutes = require("./routes/taskRoutes");
const statusRoutes = require("./routes/statusRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/status", statusRoutes);

app.get("/", (req, res) => {
  res.send("Kanban API Running");
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});