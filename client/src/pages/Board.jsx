import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  useDroppable,
  DragOverlay,
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
import "./Board.css";

const API = "http://localhost:5000/api";

async function apiFetch(url, method = "GET", body, raw = false) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    if (raw) return res;
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      console.error(method, url, res.status, e);
      return e;
    }
    return res.json();
  } catch (e) {
    console.error("Network:", url, e);
    if (raw) throw e;
    return {};
  }
}

/* ── Modal ───────────────────────────────────────────────────────────────── */
function Modal({ children, onClose }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

/* ── Sortable pill for rearrange ─────────────────────────────────────────── */
function SortableStage({ stage }) {
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
      className="rearrange-pill"
      {...attributes}
      {...listeners}
    >
      <span className="rearrange-grip">⠿</span>
      {stage.name}
      {(stage.is_completed === 1 || stage.is_completed === true) && (
        <span className="pill-badge">✓ Final</span>
      )}
    </div>
  );
}

/* ── Board ───────────────────────────────────────────────────────────────── */
export default function Board() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [stages, setStages] = useState([]);
  const [tasksByColumn, setTBC] = useState({});
  const [activeTask, setActiveTask] = useState(null);
  const [loading, setLoading] = useState(true);

  // Task modal
  const [showTask, setShowTask] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tPriority, setTPriority] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  // Subtask modal
  const [showSubtask, setShowSubtask] = useState(false);
  const [subtaskParent, setSubtaskParent] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [stTitle, setStTitle] = useState("");
  const [stDesc, setStDesc] = useState("");
  const [savingST, setSavingST] = useState(false);
  const [loadingST, setLoadingST] = useState(false);

  // Stage modal
  const [showStage, setShowStage] = useState(false);
  const [editStage, setEditStage] = useState(null);
  const [sgName, setSgName] = useState("");
  const [sgCompleted, setSgCompleted] = useState(false);
  const [sgPosition, setSgPosition] = useState("");
  const [sgLimit, setSgLimit] = useState("");
  const [savingSg, setSavingSg] = useState(false);

  // Conflict
  const [showConflict, setShowConflict] = useState(false);
  const [pendingPayload, setPendingPL] = useState(null);
  const [pendingIsEdit, setPendingIsEdit] = useState(false);

  // Rearrange
  const [showRearrange, setShowRearrange] = useState(false);
  const [rrList, setRRList] = useState([]);
  const [savingRR, setSavingRR] = useState(false);

  // Confirm
  const [confirm, setConfirm] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const rrSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProject(), fetchStages(), fetchTasks()]).finally(() =>
      setLoading(false),
    );
  }, [id]);

  const fetchProject = async () => {
    const d = await apiFetch(`${API}/projects`);
    if (Array.isArray(d)) {
      const p = d.find((x) => String(x.id) === String(id));
      if (p) setProject(p);
    }
  };
  const fetchStages = async () => {
    const d = await apiFetch(`${API}/projects/${id}/stages`);
    if (Array.isArray(d))
      setStages([...d].sort((a, b) => a.position - b.position));
  };
  const fetchTasks = async () => {
    const d = await apiFetch(`${API}/tasks/project/${id}`);
    if (!Array.isArray(d)) return;
    const g = {};
    d.forEach((t) => {
      if (!g[t.status_id]) g[t.status_id] = [];
      g[t.status_id].push(t);
    });
    Object.values(g).forEach((arr) =>
      arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    );
    setTBC(g);
  };

  /* ── Drag ───────────────────────────────────────────────────────────────── */
  const handleDragStart = ({ active }) => {
    for (const tasks of Object.values(tasksByColumn)) {
      const t = tasks.find((x) => x.id === active.id);
      if (t) {
        setActiveTask(t);
        break;
      }
    }
  };
  const handleDragEnd = async ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;
    const src = active.data.current?.sortable?.containerId;
    const tgt = over.data.current?.sortable?.containerId ?? over.id;
    if (!src || !tgt) return;
    let updated = { ...tasksByColumn };
    if (String(src) === String(tgt)) {
      const col = tasksByColumn[src] ?? [];
      const oi = col.findIndex((t) => t.id === active.id),
        ni = col.findIndex((t) => t.id === over.id);
      if (oi === -1 || ni === -1 || oi === ni) return;
      updated = { ...tasksByColumn, [src]: arrayMove(col, oi, ni) };
      setTBC(updated);
    } else {
      const s = [...(tasksByColumn[src] ?? [])],
        t = [...(tasksByColumn[tgt] ?? [])];
      const i = s.findIndex((x) => x.id === active.id);
      if (i === -1) return;
      const [mv] = s.splice(i, 1);
      t.push({ ...mv, status_id: Number(tgt) });
      updated = { ...tasksByColumn, [src]: s, [tgt]: t };
      setTBC(updated);
      await apiFetch(`${API}/tasks/${active.id}/status`, "PUT", {
        status_id: Number(tgt),
      });
    }
    const payload = [];
    for (const [cid, tasks] of Object.entries(updated))
      tasks.forEach((task, i) =>
        payload.push({
          id: task.id,
          status_id: Number(cid),
          position: i,
        }),
      );
    await apiFetch(`${API}/tasks/reorder`, "PUT", { tasks: payload });
  };

  /* ── Task CRUD ──────────────────────────────────────────────────────────── */
  const openCreateTask = () => {
    setEditingTask(null);
    setTTitle("");
    setTDesc("");
    setTPriority(false);
    setShowTask(true);
  };
  const openEditTask = (t) => {
    setEditingTask(t);
    setTTitle(t.title);
    setTDesc(t.description ?? "");
    setTPriority(!!t.is_priority);
    setShowTask(true);
  };

  const handleSaveTask = async () => {
    if (!tTitle.trim()) return;
    setSavingTask(true);
    try {
      if (editingTask) {
        await apiFetch(`${API}/tasks/${editingTask.id}`, "PUT", {
          title: tTitle.trim(),
          description: tDesc,
          is_priority: tPriority,
        });
      } else {
        // Find pending stage
        const pendingStage =
          stages.find((s) => s.is_pending === 1 || s.is_pending === true) ??
          stages.find(
            (s) => !(s.is_completed === 1 || s.is_completed === true),
          ) ??
          stages[0];
        if (!pendingStage) {
          alert("Create at least one stage first.");
          return;
        }
        await apiFetch(`${API}/tasks`, "POST", {
          project_id: id,
          status_id: pendingStage.id,
          title: tTitle.trim(),
          description: tDesc,
          is_priority: tPriority,
        });
      }
      await fetchTasks();
      setShowTask(false);
      setEditingTask(null);
    } finally {
      setSavingTask(false);
    }
  };

  /* ── Subtasks ────────────────────────────────────────────────────────────── */
  const openSubtasks = async (task) => {
    setSubtaskParent(task);
    setStTitle("");
    setStDesc("");
    setShowSubtask(true);
    setLoadingST(true);
    const d = await apiFetch(`${API}/tasks/${task.id}/subtasks`);
    setSubtasks(Array.isArray(d) ? d : []);
    setLoadingST(false);
  };

  const handleAddSubtask = async () => {
    if (!stTitle.trim() || !subtaskParent) return;
    setSavingST(true);
    try {
      await apiFetch(`${API}/tasks`, "POST", {
        project_id: id,
        status_id: subtaskParent.status_id,
        title: stTitle.trim(),
        description: stDesc,
        parent_task_id: subtaskParent.id,
      });
      setStTitle("");
      setStDesc("");
      const d = await apiFetch(`${API}/tasks/${subtaskParent.id}/subtasks`);
      setSubtasks(Array.isArray(d) ? d : []);
      // Update count in parent display
      await fetchTasks();
    } finally {
      setSavingST(false);
    }
  };

  const handleDeleteSubtask = async (st) => {
    await apiFetch(`${API}/tasks/${st.id}`, "DELETE");
    const d = await apiFetch(`${API}/tasks/${subtaskParent.id}/subtasks`);
    setSubtasks(Array.isArray(d) ? d : []);
    await fetchTasks();
  };

  const handleToggleSubtask = async (st) => {
    const completedStage = stages.find(
      (s) => s.is_completed === 1 || s.is_completed === true,
    );
    const firstStage = stages[0];
    const isDone = String(st.status_id) === String(completedStage?.id);
    const newStatusId = isDone
      ? firstStage?.id
      : (completedStage?.id ?? st.status_id);
    await apiFetch(`${API}/tasks/${st.id}/status`, "PUT", {
      status_id: newStatusId,
    });
    const d = await apiFetch(`${API}/tasks/${subtaskParent.id}/subtasks`);
    setSubtasks(Array.isArray(d) ? d : []);
  };

  /* ── Stage CRUD ─────────────────────────────────────────────────────────── */
  const openCreateStage = () => {
    setEditStage(null);
    setSgName("");
    setSgCompleted(false);
    setSgPosition("");
    setSgLimit("");
    setShowStage(true);
  };
  const openEditStage = (s) => {
    setEditStage(s);
    setSgName(s.name);
    setSgCompleted(s.is_completed === 1 || s.is_completed === true);
    setSgPosition(String(s.position));
    setSgLimit(s.task_limit != null ? String(s.task_limit) : "");
    setShowStage(true);
  };

  const buildCreatePL = (isC) => ({
    status_name: sgName.trim(),
    position: sgCompleted
      ? stages.length + 1
      : sgPosition
        ? Math.max(1, Math.min(Number(sgPosition), stages.length + 1))
        : stages.length + 1,
    is_completed: isC,
    task_limit: sgLimit ? Number(sgLimit) : null,
  });

  const handleStageSubmit = () => {
    if (!sgName.trim()) return;
    const conflict = stages.find(
      (s) =>
        (s.is_completed === 1 || s.is_completed === true) &&
        (!editStage || s.id !== editStage.id),
    );
    if (sgCompleted && conflict) {
      setPendingPL(editStage ? null : buildCreatePL(true));
      setPendingIsEdit(!!editStage);
      setShowConflict(true);
      return;
    }
    editStage
      ? doEditStage(sgCompleted)
      : doCreateStage(buildCreatePL(sgCompleted));
  };

  const doCreateStage = async (pl) => {
    setSavingSg(true);
    try {
      const res = await apiFetch(
        `${API}/projects/${id}/stages`,
        "POST",
        pl,
        true,
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(`Failed: ${e.error ?? res.status}`);
        return;
      }
      setShowStage(false);
      await fetchStages();
    } finally {
      setSavingSg(false);
    }
  };

  const doEditStage = async (isC) => {
    setSavingSg(true);
    try {
      const res = await apiFetch(
        `${API}/projects/${id}/stages/${editStage.id}`,
        "PUT",
        {
          status_name: sgName.trim(),
          is_completed: isC,
          task_limit: sgLimit ? Number(sgLimit) : null,
        },
        true,
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(`Failed: ${e.error ?? res.status}`);
        return;
      }
      setShowStage(false);
      setEditStage(null);
      await fetchStages();
    } finally {
      setSavingSg(false);
    }
  };

  const handleReplaceCompleted = async () => {
    const ex = stages.find(
      (s) =>
        (s.is_completed === 1 || s.is_completed === true) &&
        (!editStage || s.id !== editStage.id),
    );
    if (ex)
      await apiFetch(`${API}/projects/${id}/stages/${ex.id}`, "PUT", {
        status_name: ex.name,
        is_completed: false,
        task_limit: ex.task_limit,
      });
    setShowConflict(false);
    pendingIsEdit
      ? await doEditStage(true)
      : await doCreateStage(pendingPayload);
    setPendingPL(null);
  };
  const handleKeepExisting = async () => {
    setShowConflict(false);
    pendingIsEdit
      ? await doEditStage(false)
      : await doCreateStage({ ...pendingPayload, is_completed: false });
    setPendingPL(null);
  };

  const handleDeleteStage = (s) =>
    setConfirm({
      type: "delete-stage",
      id: s.id,
      label: `Delete stage "${s.name}"? Tasks inside become unassigned.`,
    });

  /* ── Rearrange ───────────────────────────────────────────────────────────── */
  const openRearrange = () => {
    setRRList([...stages]);
    setShowRearrange(true);
  };
  const handleRRDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oi = rrList.findIndex((s) => s.id === active.id),
      ni = rrList.findIndex((s) => s.id === over.id);
    setRRList(arrayMove(rrList, oi, ni));
  };
  const saveRearrange = async () => {
    setSavingRR(true);
    const pl = rrList.map((s, i) => ({
      id: s.id,
      position: i + 1,
    }));
    const res = await apiFetch(
      `${API}/projects/${id}/stages/reorder`,
      "PUT",
      { stages: pl },
      true,
    );
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(`Failed: ${e.error ?? res.status}`);
    }
    setSavingRR(false);
    setShowRearrange(false);
    await fetchStages();
  };

  /* ── Confirm ─────────────────────────────────────────────────────────────── */
  const handleConfirm = async () => {
    const a = confirm;
    setConfirm(null);
    if (!a) return;
    if (a.type === "delete-task") {
      await apiFetch(`${API}/tasks/${a.id}`, "DELETE");
      await fetchTasks();
    } else if (a.type === "delete-stage") {
      await apiFetch(`${API}/projects/${id}/stages/${a.id}`, "DELETE");
      await fetchStages();
      await fetchTasks();
    } else if (a.type === "move") {
      await apiFetch(`${API}/tasks/${a.extra.task.id}/status`, "PUT", {
        status_id: a.extra.nextStage.id,
      });
      await fetchTasks();
    }
  };

  const handleMoveToNext = (task, curStage) => {
    const idx = stages.findIndex((s) => s.id === curStage.id);
    const next = stages[idx + 1];
    if (!next) return;
    setConfirm({
      type: "move",
      label: `Move "${task.title}" → "${next.name}"?`,
      extra: { task, nextStage: next },
    });
  };
  const handleDeleteTask = (t) =>
    setConfirm({
      type: "delete-task",
      id: t.id,
      label: `Delete "${t.title}"? Cannot be undone.`,
    });

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="board-page">
      <nav className="navbar">
        <div className="navbar-left">
          <button className="nav-back-btn" onClick={() => navigate("/")}>
            ← Projects
          </button>
          <span className="nav-sep" />
          <span className="nav-project-name">
            {project?.name ?? "Loading…"}
          </span>
        </div>
        <div className="navbar-center">
          <div className="nav-logo">
            <div className="nav-logo-icon">⬡</div>Kanban
          </div>
        </div>
        <div className="navbar-right">
          <button
            className="board-btn primary nav-btn"
            onClick={openCreateTask}
          >
            + Task
          </button>
          <button
            className="board-btn secondary nav-btn"
            onClick={openCreateStage}
          >
            + Stage
          </button>
        </div>
      </nav>

      <div className="board-container">
        {loading ? (
          <div className="empty-board">
            <div className="empty-icon">⏳</div>
            <p>Loading board…</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="stages-wrapper">
              {stages.length === 0 ? (
                <div className="empty-board">
                  <div className="empty-icon">📋</div>
                  <p>No stages yet. Create your first stage to get started.</p>
                  <button
                    className="board-btn primary"
                    style={{ marginTop: 8 }}
                    onClick={openCreateStage}
                  >
                    + Create Stage
                  </button>
                </div>
              ) : (
                stages.map((stage) => (
                  <Column
                    key={stage.id}
                    stage={stage}
                    stages={stages}
                    tasks={tasksByColumn[stage.id] ?? []}
                    onEditTask={openEditTask}
                    onDeleteTask={handleDeleteTask}
                    onMoveToNext={handleMoveToNext}
                    onSubtasks={openSubtasks}
                    onEditStage={openEditStage}
                    onDeleteStage={handleDeleteStage}
                    onRearrange={openRearrange}
                  />
                ))
              )}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div
                  className={`task-card overlay${activeTask.is_priority ? " task-priority" : ""}`}
                >
                  {activeTask.is_priority && (
                    <div className="priority-banner">🔴 Priority</div>
                  )}
                  <div className="task-title">{activeTask.title}</div>
                  {activeTask.description && (
                    <div className="task-description">
                      {activeTask.description}
                    </div>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ═══ Create/Edit Task ═══ */}
      {showTask && (
        <Modal
          onClose={() => {
            setShowTask(false);
            setEditingTask(null);
          }}
        >
          <h2 className="modal-title">
            {editingTask ? "Edit Task" : "New Task"}
          </h2>

          <label className="modal-label">
            Title <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            className="modal-input"
            value={tTitle}
            onChange={(e) => setTTitle(e.target.value)}
            placeholder="e.g. Design landing page"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSaveTask()}
          />

          <label className="modal-label">
            Description <span className="modal-opt">(optional)</span>
          </label>
          <textarea
            className="modal-textarea"
            value={tDesc}
            onChange={(e) => setTDesc(e.target.value)}
            placeholder="Add more details…"
            rows={4}
          />

          {/* Priority toggle */}
          <div className="priority-toggle-wrap">
            <button
              className={`priority-toggle ${tPriority ? "priority-toggle-on" : ""}`}
              onClick={() => setTPriority((p) => !p)}
              type="button"
            >
              <span className="pt-icon">🔴</span>
              <span className="pt-label">
                {tPriority ? "Priority / Urgent" : "Mark as Priority"}
              </span>
              <span className={`pt-pill ${tPriority ? "on" : ""}`}>
                {tPriority ? "ON" : "OFF"}
              </span>
            </button>
            {tPriority && (
              <p className="priority-hint">
                This task will be highlighted in red on the board.
              </p>
            )}
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button
              className="board-btn primary"
              onClick={handleSaveTask}
              disabled={!tTitle.trim() || savingTask}
            >
              {savingTask
                ? "Saving…"
                : editingTask
                  ? "Save Changes"
                  : "Create Task"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => {
                setShowTask(false);
                setEditingTask(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Subtasks Modal ═══ */}
      {showSubtask && subtaskParent && (
        <Modal
          onClose={() => {
            setShowSubtask(false);
            setSubtaskParent(null);
            setSubtasks([]);
          }}
        >
          <h2 className="modal-title">
            {subtaskParent.is_priority && (
              <span style={{ marginRight: 6 }}>🔴</span>
            )}
            Subtasks
          </h2>
          <p className="modal-parent-title">
            Parent: <strong>{subtaskParent.title}</strong>
          </p>

          {/* Add subtask form */}
          <div className="subtask-add-form">
            <input
              className="modal-input"
              style={{ marginBottom: 8 }}
              value={stTitle}
              onChange={(e) => setStTitle(e.target.value)}
              placeholder="Subtask title…"
              onKeyDown={(e) => e.key === "Enter" && handleAddSubtask()}
            />
            <input
              className="modal-input"
              value={stDesc}
              onChange={(e) => setStDesc(e.target.value)}
              placeholder="Description (optional)"
            />
            <button
              className="board-btn primary"
              onClick={handleAddSubtask}
              disabled={!stTitle.trim() || savingST}
              style={{ marginTop: 4 }}
            >
              {savingST ? "Adding…" : "+ Add Subtask"}
            </button>
          </div>

          {/* Subtask list */}
          <div className="subtask-list">
            {loadingST && (
              <p
                style={{
                  color: "#9ca3af",
                  fontSize: 13,
                  textAlign: "center",
                  padding: "12px 0",
                }}
              >
                Loading…
              </p>
            )}
            {!loadingST && subtasks.length === 0 && (
              <p
                style={{
                  color: "#9ca3af",
                  fontSize: 13,
                  textAlign: "center",
                  padding: "12px 0",
                }}
              >
                No subtasks yet.
              </p>
            )}
            {subtasks.map((st) => {
              const completedStage = stages.find(
                (s) => s.is_completed === 1 || s.is_completed === true,
              );
              const isDone =
                completedStage &&
                String(st.status_id) === String(completedStage.id);
              return (
                <div
                  key={st.id}
                  className={`subtask-item ${isDone ? "subtask-done" : ""}`}
                >
                  <button
                    className={`subtask-check ${isDone ? "checked" : ""}`}
                    onClick={() => handleToggleSubtask(st)}
                    title={isDone ? "Mark undone" : "Mark done"}
                  >
                    {isDone ? "✓" : ""}
                  </button>
                  <div className="subtask-text">
                    <span className="subtask-title">{st.title}</span>
                    {st.description && (
                      <span className="subtask-desc">{st.description}</span>
                    )}
                  </div>
                  <button
                    className="subtask-del"
                    onClick={() => handleDeleteSubtask(st)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>

          {subtasks.length > 0 && (
            <div className="subtask-progress">
              <div className="subtask-prog-bar">
                <div
                  className="subtask-prog-fill"
                  style={{
                    width: `${Math.round(
                      (subtasks.filter((s) => {
                        const cs = stages.find(
                          (x) =>
                            x.is_completed === 1 || x.is_completed === true,
                        );
                        return cs && String(s.id) === String(cs.id);
                      }).length /
                        subtasks.length) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <span className="subtask-prog-label">
                {
                  subtasks.filter((s) => {
                    const cs = stages.find(
                      (x) => x.is_completed === 1 || x.is_completed === true,
                    );
                    return cs && String(s.id) === String(cs.id);
                  }).length
                }{" "}
                / {subtasks.length} done
              </span>
            </div>
          )}
        </Modal>
      )}

      {/* ═══ Create/Edit Stage ═══ */}
      {showStage && (
        <Modal
          onClose={() => {
            setShowStage(false);
            setEditStage(null);
          }}
        >
          <h2 className="modal-title">
            {editStage ? "Edit Stage" : "New Stage"}
          </h2>
          <label className="modal-label">
            Stage Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            className="modal-input"
            value={sgName}
            onChange={(e) => setSgName(e.target.value)}
            placeholder="e.g. In Review"
            autoFocus
          />
          <label className="modal-label">
            Task Limit <span className="modal-opt">(blank = unlimited)</span>
          </label>
          <input
            className="modal-input"
            type="number"
            min="1"
            value={sgLimit}
            onChange={(e) => setSgLimit(e.target.value)}
            placeholder="e.g. 5"
          />
          <label className="modal-label">
            Is this a final / completed stage?
          </label>
          <div className="toggle-row">
            <button
              className={`toggle-btn ${sgCompleted ? "active" : ""}`}
              onClick={() => setSgCompleted(true)}
            >
              ✅ Yes — final
            </button>
            <button
              className={`toggle-btn ${!sgCompleted ? "active" : ""}`}
              onClick={() => setSgCompleted(false)}
            >
              🔢 No — set position
            </button>
          </div>
          {!sgCompleted && !editStage && (
            <div style={{ marginTop: 16 }}>
              <label className="modal-label">
                Position{" "}
                <span className="modal-opt">
                  (blank = last · max {stages.length + 1})
                </span>
              </label>
              <input
                className="modal-input"
                type="number"
                min="1"
                max={stages.length + 1}
                value={sgPosition}
                onChange={(e) => setSgPosition(e.target.value)}
                placeholder={`1–${stages.length + 1}`}
              />
              {sgPosition && (
                <p className="modal-hint">
                  Inserted at position {sgPosition}. Others shift right.
                </p>
              )}
            </div>
          )}
          {sgCompleted && (
            <p className="modal-hint completed-hint">
              This stage will be placed last and marked ✅ final.
            </p>
          )}
          <div className="modal-actions" style={{ marginTop: 22 }}>
            <button
              className="board-btn primary"
              onClick={handleStageSubmit}
              disabled={!sgName.trim() || savingSg}
            >
              {savingSg
                ? "Saving…"
                : editStage
                  ? "Save Changes"
                  : "Create Stage"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => {
                setShowStage(false);
                setEditStage(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Conflict ═══ */}
      {showConflict && (
        <Modal
          onClose={() => {
            setShowConflict(false);
            setPendingPL(null);
          }}
        >
          <span className="conflict-icon">⚠️</span>
          <h2 className="modal-title">Completed Stage Already Exists</h2>
          <p className="modal-body-text">
            <strong>
              "
              {
                stages.find(
                  (s) =>
                    (s.is_completed === 1 || s.is_completed === true) &&
                    (!editStage || s.id !== editStage.id),
                )?.name
              }
              "
            </strong>{" "}
            is already the final stage.
          </p>
          <div className="modal-actions column-actions">
            <button
              className="board-btn primary"
              onClick={handleReplaceCompleted}
            >
              Replace — make "{sgName}" the final stage
            </button>
            <button
              className="board-btn secondary"
              onClick={handleKeepExisting}
            >
              Keep existing — proceed without final flag
            </button>
            <button
              className="board-btn ghost"
              onClick={() => {
                setShowConflict(false);
                setPendingPL(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Rearrange ═══ */}
      {showRearrange && (
        <Modal onClose={() => setShowRearrange(false)}>
          <h2 className="modal-title">Rearrange Stages</h2>
          <p className="modal-body-text" style={{ marginBottom: 16 }}>
            Drag stages into your preferred order, then save.
          </p>
          <DndContext
            sensors={rrSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleRRDragEnd}
          >
            <SortableContext
              items={rrList.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="rearrange-list">
                {rrList.map((stage, idx) => (
                  <div key={stage.id} className="rearrange-row">
                    <span className="rearrange-num">{idx + 1}</span>
                    <SortableStage stage={stage} />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="modal-actions" style={{ marginTop: 22 }}>
            <button
              className="board-btn primary"
              onClick={saveRearrange}
              disabled={savingRR}
            >
              {savingRR ? "Saving…" : "Save Order"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => setShowRearrange(false)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Confirm ═══ */}
      {confirm && (
        <Modal onClose={() => setConfirm(null)}>
          <span className="conflict-icon">
            {confirm.type === "move" ? "➡️" : "🗑️"}
          </span>
          <h2 className="modal-title">
            {confirm.type === "move" ? "Move Task" : "Confirm Delete"}
          </h2>
          <p className="modal-body-text">{confirm.label}</p>
          <div className="modal-actions">
            <button
              className={`board-btn ${confirm.type === "move" ? "primary" : "danger-btn"}`}
              onClick={handleConfirm}
            >
              {confirm.type === "move" ? "Yes, Move" : "Delete"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Column ──────────────────────────────────────────────────────────────── */
function Column({
  stage,
  stages,
  tasks,
  onEditTask,
  onDeleteTask,
  onMoveToNext,
  onSubtasks,
  onEditStage,
  onDeleteStage,
  onRearrange,
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  const [ddOpen, setDDOpen] = useState(false);
  const ddRef = useRef(null);
  const isCompleted = stage.is_completed === 1 || stage.is_completed === true;
  const taskLimit = stage.task_limit ?? null;
  const isOver = taskLimit !== null && tasks.length > taskLimit;
  const isAt = taskLimit !== null && tasks.length === taskLimit;

  useEffect(() => {
    const h = (e) => {
      if (ddRef.current && !ddRef.current.contains(e.target)) setDDOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  let cls = "column";
  if (isOver) cls += " column-overlimit";
  else if (isAt) cls += " column-atlimit";
  if (isCompleted) cls += " column-completed";

  return (
    <div ref={setNodeRef} className={cls}>
      <div className="column-header">
        <div className="column-title-row">
          <h3 className="column-title">{stage.name}</h3>
          <div className="column-badges">
            {isCompleted && (
              <span className="stage-badge completed-badge">✓ Final</span>
            )}
            <span
              className={`task-count-badge ${isOver ? "over" : isAt ? "at" : ""}`}
            >
              {tasks.length}
              {taskLimit !== null ? `/${taskLimit}` : ""}
            </span>
          </div>
        </div>
        <div style={{ position: "relative" }} ref={ddRef}>
          <button
            className="column-menu-btn"
            onClick={() => setDDOpen((o) => !o)}
          >
            ⋯
          </button>
          {ddOpen && (
            <div className="column-dropdown">
              <div
                onClick={() => {
                  setDDOpen(false);
                  onEditStage(stage);
                }}
              >
                ✏️ Edit Stage
              </div>
              <div
                onClick={() => {
                  setDDOpen(false);
                  onRearrange();
                }}
              >
                ↕️ Rearrange Stages
              </div>
              <div className="divider" />
              <div
                className="danger"
                onClick={() => {
                  setDDOpen(false);
                  onDeleteStage(stage);
                }}
              >
                🗑️ Delete Stage
              </div>
            </div>
          )}
        </div>
      </div>

      {isOver && (
        <div className="limit-warning over">
          ⚠️ Over limit by {tasks.length - taskLimit} task
          {tasks.length - taskLimit > 1 ? "s" : ""}
        </div>
      )}
      {isAt && (
        <div className="limit-warning at">
          ⚡ Task limit reached ({taskLimit})
        </div>
      )}

      <SortableContext
        id={stage.id}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-tasks">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              stage={stage}
              isLastStage={stages[stages.length - 1]?.id === stage.id}
              stages={stages}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
              onMoveToNext={onMoveToNext}
              onSubtasks={onSubtasks}
            />
          ))}
          {tasks.length === 0 && (
            <div className="column-empty">Drop tasks here</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

/* ── TaskCard ────────────────────────────────────────────────────────────── */
function TaskCard({
  task,
  stage,
  isLastStage,
  stages,
  onEdit,
  onDelete,
  onMoveToNext,
  onSubtasks,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isPriority = task.is_priority === 1 || task.is_priority === true;

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card${isPriority ? " task-priority" : ""}`}
    >
      {isPriority && (
        <div className="priority-banner">🔴 Priority / Urgent</div>
      )}
      <div className="task-header">
        <div {...listeners} {...attributes} className="task-drag" title="Drag">
          ⠿
        </div>
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            className="task-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="task-dropdown">
              <div
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(task);
                }}
              >
                ✏️ Edit
              </div>
              <div
                onClick={() => {
                  setMenuOpen(false);
                  onSubtasks(task);
                }}
              >
                📋 Subtasks
              </div>
              {!isLastStage && (
                <div
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveToNext(task, stage);
                  }}
                >
                  ➡️ Move to Next
                </div>
              )}
              <div className="divider" />
              <div
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(task);
                }}
              >
                🗑️ Delete
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="task-title">{task.title}</div>
      {task.description && (
        <div className="task-description">{task.description}</div>
      )}
    </div>
  );
}
