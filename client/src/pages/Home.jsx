import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

const API = "http://localhost:5000/api";

function Home() {
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const fetchProjects = () => {
    fetch(`${API}/projects`)
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch(console.error);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const openModal = () => {
    setProjectName("");
    setDescription("");
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!projectName.trim()) return;
    setIsCreating(true);
    await fetch(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_name: projectName.trim(), description }),
    });
    setIsCreating(false);
    setShowModal(false);
    fetchProjects();
  };

  const filtered = projects.filter((p) =>
    p.project_name.toLowerCase().includes(search.toLowerCase()),
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Pick a deterministic color per project
  const palette = [
    "#2563eb",
    "#7c3aed",
    "#db2777",
    "#059669",
    "#d97706",
    "#0891b2",
  ];
  const getColor = (id) => palette[id % palette.length];
  const getInitials = (name) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  return (
    <div className="home-page">
      {/* ── Navbar ── */}
      <nav className="home-nav">
        <span className="home-nav-logo">⬡ Kanban</span>
        <button className="home-nav-btn" onClick={openModal}>
          + New Project
        </button>
      </nav>

      {/* ── Hero ── */}
      <div className="home-hero">
        <h1 className="home-hero-title">Your Projects</h1>
        <p className="home-hero-sub">
          Select a project to open its board, or create a new one.
        </p>

        <div className="home-search-wrap">
          <span className="home-search-icon">🔍</span>
          <input
            className="home-search"
            type="text"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Project Grid ── */}
      <div className="home-body">
        {filtered.length === 0 && projects.length === 0 && (
          <div className="home-empty">
            <div className="home-empty-icon">📋</div>
            <h2>No projects yet</h2>
            <p>
              Create your first project to get started with your Kanban board.
            </p>
            <button className="home-create-big" onClick={openModal}>
              + Create First Project
            </button>
          </div>
        )}

        {filtered.length === 0 && projects.length > 0 && (
          <div className="home-empty">
            <div className="home-empty-icon">🔎</div>
            <p>No projects match "{search}"</p>
          </div>
        )}

        <div className="project-grid">
          {/* New project card */}
          <div className="project-card new-card" onClick={openModal}>
            <div className="new-card-inner">
              <span className="new-card-plus">+</span>
              <span className="new-card-label">New Project</span>
            </div>
          </div>

          {filtered.map((project) => (
            <div
              key={project.project_id}
              className="project-card"
              onClick={() => navigate(`/project/${project.project_id}`)}
            >
              <div
                className="project-card-top"
                style={{ background: getColor(project.project_id) }}
              >
                <span className="project-initials">
                  {getInitials(project.project_name)}
                </span>
              </div>
              <div className="project-card-body">
                <h3 className="project-card-name">{project.project_name}</h3>
                {project.description && (
                  <p className="project-card-desc">{project.description}</p>
                )}
                {project.created_at && (
                  <span className="project-card-date">
                    Created {formatDate(project.created_at)}
                  </span>
                )}
              </div>
              <div className="project-card-footer">
                <span className="project-open-btn">Open Board →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Create Project Modal ── */}
      {showModal && (
        <div className="home-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="home-modal" onClick={(e) => e.stopPropagation()}>
            <div className="home-modal-header">
              <h2>Create New Project</h2>
              <button
                className="home-modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <label className="modal-label">
              Project Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              className="modal-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Website Redesign"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />

            <label className="modal-label">
              Description{" "}
              <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>
                (optional)
              </span>
            </label>
            <textarea
              className="modal-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />

            <p className="home-modal-hint">
              ✓ 3 default stages (Pending, In Progress, Completed) will be
              created automatically.
            </p>

            <div className="home-modal-actions">
              <button
                className="home-create-btn"
                onClick={handleCreate}
                disabled={!projectName.trim() || isCreating}
              >
                {isCreating ? "Creating…" : "Create Project"}
              </button>
              <button
                className="home-cancel-btn"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
