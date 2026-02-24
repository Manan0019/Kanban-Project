import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./Home.css";

const API = "http://localhost:5000/api";

const palette = [
  ["#5b4cf5", "#7c3aed"],
  ["#0891b2", "#0e7490"],
  ["#059669", "#047857"],
  ["#db2777", "#be185d"],
  ["#d97706", "#b45309"],
  ["#dc2626", "#b91c1c"],
];
const getGradient = (id) => {
  const [a, b] = palette[id % palette.length];
  return `linear-gradient(135deg,${a},${b})`;
};
const getInitials = (n) =>
  n
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

async function apiFetch(url, method = "GET", body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

let _uid = 0;
const uid = () => ++_uid;

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  // Step 1 state
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pStart, setPStart] = useState(todayStr());
  const [pEnd, setPEnd] = useState("");

  // Step 2 stages state
  const [stages, setStages] = useState([]);
  const [pendingIdx, setPendingIdx] = useState(null);
  const [completedIdx, setCompletedIdx] = useState(null);

  // Edit modal
  const [editProject, setEditProject] = useState(null);
  const [epName, setEpName] = useState("");
  const [epDesc, setEpDesc] = useState("");
  const [epStart, setEpStart] = useState("");
  const [epEnd, setEpEnd] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleStageDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setStages((prev) => {
      const oi = prev.findIndex((s) => s.id === active.id);
      const ni = prev.findIndex((s) => s.id === over.id);
      // Shift pendingIdx and completedIdx to follow their stages
      if (pendingIdx === oi) setPendingIdx(ni);
      else if (oi < ni && pendingIdx > oi && pendingIdx <= ni)
        setPendingIdx((p) => p - 1);
      else if (oi > ni && pendingIdx < oi && pendingIdx >= ni)
        setPendingIdx((p) => p + 1);
      if (completedIdx === oi) setCompletedIdx(ni);
      else if (oi < ni && completedIdx > oi && completedIdx <= ni)
        setCompletedIdx((c) => c - 1);
      else if (oi > ni && completedIdx < oi && completedIdx >= ni)
        setCompletedIdx((c) => c + 1);
      return arrayMove(prev, oi, ni);
    });
  };

  const fetchProjects = () =>
    fetch(`${API}/projects`)
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(console.error);

  useEffect(() => {
    fetchProjects();
  }, []);

  /* ── Wizard ────────────────────────────────────────────────────────────── */
  const defaultStages = () => [
    { id: uid(), status_name: "Pending", task_limit: "" },
    { id: uid(), status_name: "In Progress", task_limit: "" },
    { id: uid(), status_name: "Completed", task_limit: "" },
  ];

  const openWizard = () => {
    setPName("");
    setPDesc("");
    setPStart(todayStr());
    setPEnd("");
    const s = defaultStages();
    setStages(s);
    setPendingIdx(0);
    setCompletedIdx(2);
    setWizardStep(1);
    setShowWizard(true);
  };

  const addStage = () =>
    setStages((prev) => [
      ...prev,
      { id: uid(), status_name: "", task_limit: "" },
    ]);

  const removeStage = (idx) => {
    if (stages.length <= 2) return;
    setStages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (pendingIdx === idx) setPendingIdx(null);
      else if (pendingIdx > idx) setPendingIdx((p) => p - 1);
      if (completedIdx === idx) setCompletedIdx(null);
      else if (completedIdx > idx) setCompletedIdx((c) => c - 1);
      return next;
    });
  };

  const updStage = (idx, field, val) =>
    setStages((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)),
    );

  const step1Valid = pName.trim().length > 0;
  const step2Valid =
    stages.length >= 2 &&
    stages.every((s) => s.status_name.trim()) &&
    pendingIdx !== null &&
    completedIdx !== null &&
    pendingIdx !== completedIdx;

  const handleCreate = async () => {
    if (!step2Valid) return;
    setIsCreating(true);
    try {
      const payload = {
        project_name: pName.trim(),
        description: pDesc.trim(),
        start_date: pStart || null,
        end_date: pEnd || null,
        stages: stages.map((s, i) => ({
          status_name: s.status_name.trim(),
          is_completed: i === completedIdx ? 1 : 0,
          task_limit: s.task_limit ? Number(s.task_limit) : null,
        })),
      };
      const res = await apiFetch(`${API}/projects`, "POST", payload);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(`Failed: ${e.error ?? res.status}`);
        return;
      }
      setShowWizard(false);
      fetchProjects();
    } finally {
      setIsCreating(false);
    }
  };

  /* ── Edit ────────────────────────────────────────────────────────────── */
  const openEdit = (p) => {
    setEditProject(p);
    setEpName(p.name);
    setEpDesc(p.description || "");
    setEpStart(p.start_date ? p.start_date.split("T")[0] : "");
    setEpEnd(p.end_date ? p.end_date.split("T")[0] : "");
  };

  const handleSaveEdit = async () => {
    if (!epName.trim()) return;
    setSavingEdit(true);
    try {
      await apiFetch(`${API}/projects/${editProject.id}`, "PUT", {
        project_name: epName.trim(),
        description: epDesc.trim(),
        start_date: epStart || null,
        end_date: epEnd || null,
      });
      setEditProject(null);
      fetchProjects();
    } finally {
      setSavingEdit(false);
    }
  };

  /* ── Delete ──────────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiFetch(`${API}/projects/${deleteTarget.id}`, "DELETE");
      setDeleteTarget(null);
      fetchProjects();
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="home-page">
      <nav className="home-nav">
        <div className="home-nav-logo">
          <div className="home-nav-logo-icon">⬡</div>Kanban
        </div>
        <button className="home-nav-btn" onClick={openWizard}>
          + New Project
        </button>
      </nav>

      <div className="home-hero">
        <div className="home-hero-badge">✦ Project Manager</div>
        <h1 className="home-hero-title">
          Your <span>Projects</span>
        </h1>
        <p className="home-hero-sub">
          Manage tasks, track progress, and collaborate — all in one place.
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

      <div className="home-body">
        {projects.length > 0 && (
          <div className="home-section-header">
            <span className="home-section-title">All Projects</span>
            <span className="home-section-count">
              {filtered.length} project{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
        {filtered.length === 0 && projects.length === 0 && (
          <div className="home-empty">
            <span className="home-empty-icon">📋</span>
            <h2>No projects yet</h2>
            <p>
              Create your first Kanban board and start organizing your work.
            </p>
            <button className="home-create-big" onClick={openWizard}>
              + Create First Project
            </button>
          </div>
        )}
        {filtered.length === 0 && projects.length > 0 && (
          <div className="home-empty">
            <span className="home-empty-icon">🔎</span>
            <p>No projects match "{search}"</p>
          </div>
        )}

        <div className="project-grid">
          <div className="project-card new-card" onClick={openWizard}>
            <div className="new-card-inner">
              <div className="new-card-plus">+</div>
              <span className="new-card-label">New Project</span>
            </div>
          </div>
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => navigate(`/project/${p.id}`)}
              onEdit={() => openEdit(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      </div>

      {/* ════ WIZARD ════ */}
      {showWizard && (
        <div
          className="home-modal-overlay"
          onClick={() => setShowWizard(false)}
        >
          <div
            className="home-modal wizard-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Step indicator */}
            <div className="wizard-steps">
              <div className={`wstep ${wizardStep >= 1 ? "active" : ""}`}>
                <div className="wstep-circle">1</div>
                <span>Details</span>
              </div>
              <div
                className={`wstep-line ${wizardStep >= 2 ? "active" : ""}`}
              />
              <div className={`wstep ${wizardStep >= 2 ? "active" : ""}`}>
                <div className="wstep-circle">2</div>
                <span>Stages</span>
              </div>
            </div>

            <div className="home-modal-header">
              <div>
                <h2>
                  {wizardStep === 1
                    ? "Project Details"
                    : "Setup Workflow Stages"}
                </h2>
                <p className="wizard-sub">
                  {wizardStep === 1
                    ? "Name your project and set the timeline."
                    : "Define stages. Pick which one is Pending (🟡) and which is Completed (✅)."}
                </p>
              </div>
              <button
                className="home-modal-close"
                onClick={() => setShowWizard(false)}
              >
                ✕
              </button>
            </div>

            {wizardStep === 1 && (
              <div>
                <label className="modal-label">
                  Project Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  className="modal-input"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="e.g. Website Redesign"
                  autoFocus
                />

                <label className="modal-label">
                  Description <span className="modal-opt">(optional)</span>
                </label>
                <textarea
                  className="modal-textarea"
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  placeholder="What is this project about?"
                  rows={3}
                />

                <div className="date-row">
                  <div style={{ flex: 1 }}>
                    <label className="modal-label">Start Date</label>
                    <input
                      className="modal-input"
                      type="date"
                      value={pStart}
                      onChange={(e) => setPStart(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="modal-label">
                      End Date <span className="modal-opt">(optional)</span>
                    </label>
                    <input
                      className="modal-input"
                      type="date"
                      value={pEnd}
                      min={pStart}
                      onChange={(e) => setPEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div className="home-modal-actions">
                  <button
                    className="home-create-btn"
                    onClick={() => setWizardStep(2)}
                    disabled={!step1Valid}
                  >
                    Next: Setup Stages →
                  </button>
                  <button
                    className="home-cancel-btn"
                    onClick={() => setShowWizard(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <div className="stage-legend">
                  <span>
                    <span className="legend-pill pending-pill">🟡 Pending</span>{" "}
                    New tasks added here
                  </span>
                  <span>
                    <span className="legend-pill completed-pill">
                      ✅ Completed
                    </span>{" "}
                    Final/done stage
                  </span>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStageDragEnd}
                >
                  <SortableContext
                    items={stages.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="stages-setup-list">
                      {stages.map((stage, idx) => (
                        <SortableStageRow
                          key={stage.id}
                          stage={stage}
                          idx={idx}
                          isPending={pendingIdx === idx}
                          isCompleted={completedIdx === idx}
                          onSetPending={() => setPendingIdx(idx)}
                          onSetCompleted={() => setCompletedIdx(idx)}
                          onUpdate={(field, val) => updStage(idx, field, val)}
                          onRemove={() => removeStage(idx)}
                          canRemove={stages.length > 2}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <button className="add-stage-row-btn" onClick={addStage}>
                  + Add Another Stage
                </button>

                {!step2Valid &&
                  (pendingIdx === null ||
                    completedIdx === null ||
                    pendingIdx === completedIdx) && (
                    <p className="wizard-warn">
                      ⚠️ Mark one stage as 🟡 Pending and a different one as ✅
                      Completed. All stage names required.
                    </p>
                  )}

                <div className="home-modal-actions" style={{ marginTop: 20 }}>
                  <button
                    className="home-create-btn"
                    onClick={handleCreate}
                    disabled={!step2Valid || isCreating}
                  >
                    {isCreating ? "Creating…" : "✓ Create Project"}
                  </button>
                  <button
                    className="home-cancel-btn"
                    onClick={() => setWizardStep(1)}
                  >
                    ← Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ EDIT PROJECT ════ */}
      {editProject && (
        <div
          className="home-modal-overlay"
          onClick={() => setEditProject(null)}
        >
          <div className="home-modal" onClick={(e) => e.stopPropagation()}>
            <div className="home-modal-header">
              <h2>Edit Project</h2>
              <button
                className="home-modal-close"
                onClick={() => setEditProject(null)}
              >
                ✕
              </button>
            </div>
            <label className="modal-label">
              Project Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              className="modal-input"
              value={epName}
              onChange={(e) => setEpName(e.target.value)}
              autoFocus
            />
            <label className="modal-label">
              Description <span className="modal-opt">(optional)</span>
            </label>
            <textarea
              className="modal-textarea"
              value={epDesc}
              onChange={(e) => setEpDesc(e.target.value)}
              rows={3}
            />
            <div className="date-row">
              <div style={{ flex: 1 }}>
                <label className="modal-label">Start Date</label>
                <input
                  className="modal-input"
                  type="date"
                  value={epStart}
                  onChange={(e) => setEpStart(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="modal-label">
                  End Date <span className="modal-opt">(optional)</span>
                </label>
                <input
                  className="modal-input"
                  type="date"
                  value={epEnd}
                  min={epStart}
                  onChange={(e) => setEpEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="home-modal-actions">
              <button
                className="home-create-btn"
                onClick={handleSaveEdit}
                disabled={!epName.trim() || savingEdit}
              >
                {savingEdit ? "Saving…" : "Save Changes"}
              </button>
              <button
                className="home-cancel-btn"
                onClick={() => setEditProject(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ DELETE CONFIRM ════ */}
      {deleteTarget && (
        <div
          className="home-modal-overlay"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="home-modal"
            style={{ maxWidth: 420, textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
            <h2
              style={{
                fontFamily: "'Bricolage Grotesque',sans-serif",
                fontSize: 20,
                fontWeight: 800,
                marginBottom: 12,
              }}
            >
              Delete Project?
            </h2>
            <p
              style={{
                color: "#6b7280",
                fontSize: 14,
                lineHeight: 1.7,
                marginBottom: 24,
              }}
            >
              <strong>"{deleteTarget.name}"</strong> and all its stages and
              tasks will be permanently deleted. This cannot be undone.
            </p>
            <div
              className="home-modal-actions"
              style={{ justifyContent: "center" }}
            >
              <button
                className="home-delete-btn"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                className="home-cancel-btn"
                onClick={() => setDeleteTarget(null)}
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

/* ── SortableStageRow for wizard drag-and-drop ───────────────────────────── */
function SortableStageRow({
  stage,
  idx,
  isPending,
  isCompleted,
  onSetPending,
  onSetCompleted,
  onUpdate,
  onRemove,
  canRemove,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="stage-setup-row"
    >
      <span className="stage-idx">{idx + 1}</span>

      <span
        className="stage-drag-handle"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        ⠿
      </span>

      <input
        className="stage-name-input"
        placeholder="Stage name"
        value={stage.status_name}
        onChange={(e) => onUpdate("status_name", e.target.value)}
      />

      <input
        className="stage-limit-input"
        type="number"
        min="1"
        placeholder="Limit"
        title="Max tasks (optional)"
        value={stage.task_limit}
        onChange={(e) => onUpdate("task_limit", e.target.value)}
      />

      <button
        title="Set as pending stage (new tasks go here)"
        className={`sflag-btn ${isPending ? "sflag-pending-active" : ""}`}
        onClick={onSetPending}
      >
        🟡
      </button>

      <button
        title="Set as completed stage"
        className={`sflag-btn ${isCompleted ? "sflag-completed-active" : ""}`}
        onClick={onSetCompleted}
      >
        ✅
      </button>

      <button
        className="stage-del-btn"
        onClick={onRemove}
        disabled={!canRemove}
      >
        ✕
      </button>
    </div>
  );
}

/* ── ProjectCard with 3-dot menu ─────────────────────────────────────────── */
function ProjectCard({ project, onOpen, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const now = new Date();
  const end = project.end_date ? new Date(project.end_date) : null;
  const isOverdue = end && end < now;
  const daysLeft = end ? Math.ceil((end - now) / 86400000) : null;

  return (
    <div className="project-card" onClick={onOpen}>
      <div
        className="project-card-top"
        style={{ background: getGradient(project.id) }}
      >
        <span className="project-initials">{getInitials(project.name)}</span>

        <div
          className="project-card-menu"
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="project-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="project-dropdown">
              <div
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                ✏️ Edit Project
              </div>
              <div
                onClick={() => {
                  setMenuOpen(false);
                  onOpen();
                }}
              >
                📋 Open Board
              </div>
              <div className="divider" />
              <div
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                🗑️ Delete Project
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="project-card-body">
        <h3 className="project-card-name">{project.name}</h3>
        {project.description && (
          <p className="project-card-desc">{project.description}</p>
        )}
        <div className="project-card-dates">
          {project.start_date && (
            <span className="pdate-chip">🚀 {fmtDate(project.start_date)}</span>
          )}
          {project.end_date && (
            <span
              className={`pdate-chip ${isOverdue ? "pdate-overdue" : daysLeft <= 3 ? "pdate-soon" : ""}`}
            >
              🏁 {fmtDate(project.end_date)}
              {daysLeft !== null && !isOverdue && daysLeft <= 7 && (
                <span className="pdate-days">{daysLeft}d left</span>
              )}
              {isOverdue && <span className="pdate-days">Overdue</span>}
            </span>
          )}
        </div>
      </div>

      <div className="project-card-footer">
        <span className="project-open-btn">Open Board →</span>
      </div>
    </div>
  );
}
