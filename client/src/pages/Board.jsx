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

import Modal from "../components/Modal.jsx";
import "./Board.css";

const API = "http://localhost:5000/api";

/* ─── Draggable pill for rearrange modal ────────────────────────────────────*/
function SortableStage({ stage }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.status_id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className="rearrange-pill"
      {...attributes}
      {...listeners}
    >
      <span className="rearrange-grip">⠿</span>
      {stage.status_name}
      {stage.is_completed ? <span className="pill-badge">✓ Final</span> : null}
    </div>
  );
}

/* ─── Board ─────────────────────────────────────────────────────────────────*/
export default function Board() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [stages, setStages] = useState([]);
  const [tasksByColumn, setTasksByColumn] = useState({});
  const [activeTask, setActiveTask] = useState(null);

  /* Task modal */
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  /* Stage modal (create + edit share one modal) */
  const [showStageModal, setShowStageModal] = useState(false);
  const [editingStage, setEditingStage] = useState(null);
  const [stageName, setStageName] = useState("");
  const [stageIsCompleted, setStageIsCompleted] = useState(false);
  const [stagePosition, setStagePosition] = useState("");
  const [stageTaskLimit, setStageTaskLimit] = useState("");

  /* Completed-stage conflict */
  const [showConflict, setShowConflict] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [pendingIsEdit, setPendingIsEdit] = useState(false);

  /* Rearrange modal */
  const [showRearrange, setShowRearrange] = useState(false);
  const [rearrangeList, setRearrangeList] = useState([]);
  const [savingRearrange, setSavingRearrange] = useState(false);

  /* Confirm modal */
  const [confirmAction, setConfirmAction] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor));
  const rearrangeSensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    fetchProject();
    fetchStages();
    fetchTasks();
  }, [id]);

  /* ── Fetchers ─────────────────────────────────────────────────────────── */

  const fetchProject = async () => {
    try {
      const data = await fetch(`${API}/projects`).then((r) => r.json());
      const p = data.find((x) => String(x.project_id) === String(id));
      if (p) setProject(p);
    } catch (e) {
      console.error("fetchProject:", e);
    }
  };

  const fetchStages = async () => {
    try {
      const data = await fetch(`${API}/projects/${id}/stages`).then((r) =>
        r.json(),
      );
      setStages([...data].sort((a, b) => a.order_number - b.order_number));
    } catch (e) {
      console.error("fetchStages:", e);
    }
  };

  const fetchTasks = async () => {
    try {
      const data = await fetch(`${API}/tasks/project/${id}`).then((r) =>
        r.json(),
      );
      const grouped = {};
      data.forEach((task) => {
        if (!grouped[task.status_id]) grouped[task.status_id] = [];
        grouped[task.status_id].push(task);
      });
      // The DB query already orders by position, but sort client-side too for safety
      Object.values(grouped).forEach((arr) =>
        arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      );
      setTasksByColumn(grouped);
    } catch (e) {
      console.error("fetchTasks:", e);
    }
  };

  /* ── Task drag ────────────────────────────────────────────────────────── */

  const handleDragStart = ({ active }) => {
    for (const tasks of Object.values(tasksByColumn)) {
      const t = tasks.find((x) => x.task_id === active.id);
      if (t) {
        setActiveTask(t);
        break;
      }
    }
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;

    const source = active.data.current?.sortable?.containerId;
    const target = over.data.current?.sortable?.containerId ?? over.id;
    if (!source || !target) return;

    let updated = { ...tasksByColumn };

    if (String(source) === String(target)) {
      /* Same-column reorder */
      const col = tasksByColumn[source] ?? [];
      const oldIdx = col.findIndex((t) => t.task_id === active.id);
      const newIdx = col.findIndex((t) => t.task_id === over.id);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
      const reordered = arrayMove(col, oldIdx, newIdx);
      updated = { ...tasksByColumn, [source]: reordered };
      setTasksByColumn(updated);
    } else {
      /* Cross-column move */
      const srcTasks = [...(tasksByColumn[source] ?? [])];
      const tgtTasks = [...(tasksByColumn[target] ?? [])];
      const idx = srcTasks.findIndex((t) => t.task_id === active.id);
      if (idx === -1) return;
      const [moved] = srcTasks.splice(idx, 1);
      tgtTasks.push({ ...moved, status_id: Number(target) });
      updated = { ...tasksByColumn, [source]: srcTasks, [target]: tgtTasks };
      setTasksByColumn(updated);

      /* Persist status change immediately */
      await apiFetch(`${API}/tasks/${active.id}/status`, "PUT", {
        status_id: Number(target),
      });
    }

    /* Persist every task's position so reloads restore the exact order */
    const payload = [];
    for (const [colId, tasks] of Object.entries(updated)) {
      tasks.forEach((task, i) =>
        payload.push({
          task_id: task.task_id,
          status_id: Number(colId),
          position: i,
        }),
      );
    }
    await apiFetch(`${API}/tasks/reorder`, "PUT", { tasks: payload });
  };

  /* ── Task CRUD ────────────────────────────────────────────────────────── */

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskTitle("");
    setTaskDescription("");
    setShowTaskModal(true);
  };

  const openEditTask = (task) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description ?? "");
    setShowTaskModal(true);
  };

  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return;
    if (editingTask) {
      await apiFetch(`${API}/tasks/${editingTask.task_id}`, "PUT", {
        title: taskTitle,
        description: taskDescription,
      });
    } else {
      const firstStageId = stages[0]?.status_id;
      if (!firstStageId) return alert("Create at least one stage first.");
      await apiFetch(`${API}/tasks`, "POST", {
        project_id: id,
        status_id: firstStageId,
        title: taskTitle,
        description: taskDescription,
      });
    }
    await fetchTasks();
    setShowTaskModal(false);
    setEditingTask(null);
    setTaskTitle("");
    setTaskDescription("");
  };

  const handleMoveToNext = (task, currentStage) => {
    const idx = stages.findIndex((s) => s.status_id === currentStage.status_id);
    const nextStage = stages[idx + 1];
    if (!nextStage) return;
    setConfirmAction({
      type: "move",
      label: `Move "${task.title}" → "${nextStage.status_name}"?`,
      extra: { task, nextStage },
    });
  };

  const handleDeleteTask = (task) => {
    setConfirmAction({
      type: "delete-task",
      id: task.task_id,
      label: `Delete task "${task.title}"? Cannot be undone.`,
    });
  };

  const handleConfirm = async () => {
    const a = confirmAction;
    setConfirmAction(null);
    if (!a) return;
    if (a.type === "delete-task") {
      await apiFetch(`${API}/tasks/${a.id}`, "DELETE");
      await fetchTasks();
    } else if (a.type === "delete-stage") {
      await apiFetch(`${API}/projects/${id}/stages/${a.id}`, "DELETE");
      await fetchStages();
      await fetchTasks();
    } else if (a.type === "move") {
      await apiFetch(`${API}/tasks/${a.extra.task.task_id}/status`, "PUT", {
        status_id: a.extra.nextStage.status_id,
      });
      await fetchTasks();
    }
  };

  /* ── Stage CRUD ───────────────────────────────────────────────────────── */

  const openCreateStage = () => {
    setEditingStage(null);
    setStageName("");
    setStageIsCompleted(false);
    setStagePosition("");
    setStageTaskLimit("");
    setShowStageModal(true);
  };

  const openEditStage = (stage) => {
    setEditingStage(stage);
    setStageName(stage.status_name);
    setStageIsCompleted(
      stage.is_completed === 1 || stage.is_completed === true,
    );
    setStagePosition(String(stage.order_number));
    setStageTaskLimit(stage.task_limit != null ? String(stage.task_limit) : "");
    setShowStageModal(true);
  };

  /* Build payload used only for CREATE */
  const buildCreatePayload = (isCompleted) => {
    const max = stages.length;
    const position = isCompleted
      ? max + 1
      : stagePosition
        ? Math.max(1, Math.min(Number(stagePosition), max + 1))
        : max + 1;
    return {
      status_name: stageName.trim(),
      order_number: position,
      is_completed: isCompleted,
      task_limit: stageTaskLimit ? Number(stageTaskLimit) : null,
    };
  };

  /* Entry point when user clicks Save inside stage modal */
  const handleStageSubmit = () => {
    if (!stageName.trim()) return;

    const conflictStage = stages.find(
      (s) =>
        (s.is_completed === 1 || s.is_completed === true) &&
        (!editingStage || s.status_id !== editingStage.status_id),
    );

    if (stageIsCompleted && conflictStage) {
      setPendingPayload(editingStage ? null : buildCreatePayload(true));
      setPendingIsEdit(!!editingStage);
      setShowConflict(true);
      return;
    }

    if (editingStage) {
      doEditStage(stageIsCompleted);
    } else {
      doCreateStage(buildCreatePayload(stageIsCompleted));
    }
  };

  const doCreateStage = async (payload) => {
    const res = await apiFetch(
      `${API}/projects/${id}/stages`,
      "POST",
      payload,
      true,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Create stage failed: ${err.error ?? res.status}`);
      return;
    }
    setShowStageModal(false);
    await fetchStages();
  };

  /* Edit only updates name, is_completed, task_limit */
  const doEditStage = async (isCompleted) => {
    const body = {
      status_name: stageName.trim(),
      is_completed: isCompleted,
      task_limit: stageTaskLimit ? Number(stageTaskLimit) : null,
    };
    const res = await apiFetch(
      `${API}/projects/${id}/stages/${editingStage.status_id}`,
      "PUT",
      body,
      true,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Edit stage failed: ${err.error ?? res.status}`);
      return;
    }
    setShowStageModal(false);
    setEditingStage(null);
    await fetchStages();
  };

  /* Conflict handlers */
  const handleReplaceCompleted = async () => {
    const existing = stages.find(
      (s) =>
        (s.is_completed === 1 || s.is_completed === true) &&
        (!editingStage || s.status_id !== editingStage.status_id),
    );
    if (existing) {
      await apiFetch(
        `${API}/projects/${id}/stages/${existing.status_id}`,
        "PUT",
        {
          status_name: existing.status_name,
          is_completed: false,
          task_limit: existing.task_limit,
        },
      );
    }
    setShowConflict(false);
    if (pendingIsEdit) {
      await doEditStage(true);
    } else {
      await doCreateStage(pendingPayload);
    }
    setPendingPayload(null);
  };

  const handleKeepExisting = async () => {
    setShowConflict(false);
    if (pendingIsEdit) {
      await doEditStage(false);
    } else {
      await doCreateStage({ ...pendingPayload, is_completed: false });
    }
    setPendingPayload(null);
  };

  const handleDeleteStage = (stage) => {
    setConfirmAction({
      type: "delete-stage",
      id: stage.status_id,
      label: `Delete stage "${stage.status_name}"? Tasks inside will become unassigned.`,
    });
  };

  /* ── Rearrange stages ─────────────────────────────────────────────────── */

  const openRearrange = () => {
    setRearrangeList([...stages]);
    setShowRearrange(true);
  };

  const handleRearrangeDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = rearrangeList.findIndex((s) => s.status_id === active.id);
    const newIdx = rearrangeList.findIndex((s) => s.status_id === over.id);
    setRearrangeList(arrayMove(rearrangeList, oldIdx, newIdx));
  };

  const saveRearrange = async () => {
    setSavingRearrange(true);
    const payload = rearrangeList.map((stage, i) => ({
      status_id: stage.status_id,
      order_number: i + 1,
    }));
    const res = await apiFetch(
      `${API}/projects/${id}/stages/reorder`,
      "PUT",
      { stages: payload },
      true,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed to save order: ${err.error ?? res.status}`);
    }
    setSavingRearrange(false);
    setShowRearrange(false);
    await fetchStages();
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div className="board-page">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-left">
          <button className="nav-back-btn" onClick={() => navigate("/")}>
            <span>←</span> Projects
          </button>
          <span className="nav-separator" />
          <span className="nav-project-name">
            {project?.project_name ?? "…"}
          </span>
        </div>
        <div className="navbar-center">
          <span className="nav-logo">⬡ Kanban</span>
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

      {/* Board */}
      <div className="board-container">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="stages-wrapper">
            {stages.map((stage) => (
              <Column
                key={stage.status_id}
                stage={stage}
                stages={stages}
                tasks={tasksByColumn[stage.status_id] ?? []}
                onEditTask={openEditTask}
                onDeleteTask={handleDeleteTask}
                onMoveToNext={handleMoveToNext}
                onEditStage={openEditStage}
                onDeleteStage={handleDeleteStage}
                onRearrange={openRearrange}
              />
            ))}
            {stages.length === 0 && (
              <div className="empty-board">
                <div className="empty-icon">📋</div>
                <p>No stages yet. Create your first stage to get started.</p>
                <button className="board-btn primary" onClick={openCreateStage}>
                  + Create Stage
                </button>
              </div>
            )}
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="task-card overlay">
                <div className="task-title">{activeTask.title}</div>
                {activeTask.description && (
                  <div className="task-description">
                    {activeTask.description}
                  </div>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ═══ Create / Edit Task ═══ */}
      {showTaskModal && (
        <Modal onClose={() => setShowTaskModal(false)}>
          <h2 className="modal-title">
            {editingTask ? "Edit Task" : "Create Task"}
          </h2>
          <label className="modal-label">Title</label>
          <input
            className="modal-input"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
          />
          <label className="modal-label">
            Description <span className="modal-optional">(optional)</span>
          </label>
          <textarea
            className="modal-textarea"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Add a description…"
            rows={4}
          />
          <div className="modal-actions">
            <button className="board-btn primary" onClick={handleSaveTask}>
              {editingTask ? "Save Changes" : "Create Task"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => setShowTaskModal(false)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Create / Edit Stage ═══ */}
      {showStageModal && (
        <Modal
          onClose={() => {
            setShowStageModal(false);
            setEditingStage(null);
          }}
        >
          <h2 className="modal-title">
            {editingStage ? "Edit Stage" : "Create Stage"}
          </h2>

          <label className="modal-label">Stage Name</label>
          <input
            className="modal-input"
            value={stageName}
            onChange={(e) => setStageName(e.target.value)}
            placeholder="e.g. In Review"
            autoFocus
          />

          <label className="modal-label">
            Task Limit{" "}
            <span className="modal-optional">(leave blank for unlimited)</span>
          </label>
          <input
            className="modal-input"
            type="number"
            min="1"
            value={stageTaskLimit}
            onChange={(e) => setStageTaskLimit(e.target.value)}
            placeholder="e.g. 5"
          />

          <label className="modal-label">
            Is this a final / completed stage?
          </label>
          <div className="toggle-row">
            <button
              className={`toggle-btn ${stageIsCompleted ? "active" : ""}`}
              onClick={() => setStageIsCompleted(true)}
            >
              ✅ Yes — place at end
            </button>
            <button
              className={`toggle-btn ${!stageIsCompleted ? "active" : ""}`}
              onClick={() => setStageIsCompleted(false)}
            >
              🔢 No — set position
            </button>
          </div>

          {!stageIsCompleted && !editingStage && (
            <div style={{ marginTop: 14 }}>
              <label className="modal-label">
                Position{" "}
                <span className="modal-optional">
                  (1 = first · blank = last · max: {stages.length + 1})
                </span>
              </label>
              <input
                className="modal-input"
                type="number"
                min="1"
                max={stages.length + 1}
                value={stagePosition}
                onChange={(e) => setStagePosition(e.target.value)}
                placeholder={`1 – ${stages.length + 1}`}
              />
              {stagePosition && (
                <p className="modal-hint">
                  Will be inserted at position {stagePosition}. Others shift
                  right.
                </p>
              )}
            </div>
          )}

          {stageIsCompleted && (
            <p className="modal-hint completed-hint">
              This stage will be placed last and marked as ✅ final.
            </p>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button className="board-btn primary" onClick={handleStageSubmit}>
              {editingStage ? "Save Changes" : "Create Stage"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => {
                setShowStageModal(false);
                setEditingStage(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Completed Stage Conflict ═══ */}
      {showConflict && (
        <Modal
          onClose={() => {
            setShowConflict(false);
            setPendingPayload(null);
          }}
        >
          <div className="conflict-icon">⚠️</div>
          <h2 className="modal-title">Completed Stage Already Exists</h2>
          <p className="modal-body-text">
            <strong>
              "
              {
                stages.find(
                  (s) =>
                    (s.is_completed === 1 || s.is_completed === true) &&
                    (!editingStage || s.status_id !== editingStage.status_id),
                )?.status_name
              }
              "
            </strong>{" "}
            is already the final stage. What would you like to do?
          </p>
          <div className="modal-actions column-actions">
            <button
              className="board-btn primary"
              onClick={handleReplaceCompleted}
            >
              Replace — make "{stageName}" the final stage
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
                setPendingPayload(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Rearrange Stages ═══ */}
      {showRearrange && (
        <Modal onClose={() => setShowRearrange(false)}>
          <h2 className="modal-title">Rearrange Stages</h2>
          <p className="modal-body-text" style={{ marginBottom: 16 }}>
            Drag stages into your preferred order, then save.
          </p>
          <DndContext
            sensors={rearrangeSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleRearrangeDragEnd}
          >
            <SortableContext
              items={rearrangeList.map((s) => s.status_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="rearrange-list">
                {rearrangeList.map((stage, idx) => (
                  <div key={stage.status_id} className="rearrange-row">
                    <span className="rearrange-num">{idx + 1}</span>
                    <SortableStage stage={stage} />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button
              className="board-btn primary"
              onClick={saveRearrange}
              disabled={savingRearrange}
            >
              {savingRearrange ? "Saving…" : "Save Order"}
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

      {/* ═══ Generic Confirm ═══ */}
      {confirmAction && (
        <Modal onClose={() => setConfirmAction(null)}>
          <div className="conflict-icon">
            {confirmAction.type === "move" ? "➡️" : "🗑️"}
          </div>
          <h2 className="modal-title">
            {confirmAction.type === "move" ? "Move Task" : "Confirm Delete"}
          </h2>
          <p className="modal-body-text">{confirmAction.label}</p>
          <div className="modal-actions">
            <button
              className={`board-btn ${confirmAction.type === "move" ? "primary" : "danger-btn"}`}
              onClick={handleConfirm}
            >
              {confirmAction.type === "move" ? "Yes, Move" : "Delete"}
            </button>
            <button
              className="board-btn secondary"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── Column ─────────────────────────────────────────────────────────────────*/
function Column({
  stage,
  stages,
  tasks,
  onEditTask,
  onDeleteTask,
  onMoveToNext,
  onEditStage,
  onDeleteStage,
  onRearrange,
}) {
  const { setNodeRef } = useDroppable({ id: stage.status_id });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isLastStage = stages[stages.length - 1]?.status_id === stage.status_id;
  const taskLimit = stage.task_limit ?? null;
  const isOver = taskLimit !== null && tasks.length > taskLimit;
  const isAt = taskLimit !== null && tasks.length === taskLimit;

  useEffect(() => {
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  let cls = "column";
  if (isOver) cls += " column-overlimit";
  else if (isAt) cls += " column-atlimit";
  if (stage.is_completed === 1 || stage.is_completed === true)
    cls += " column-completed";

  return (
    <div ref={setNodeRef} className={cls}>
      <div className="column-header">
        <div className="column-title-row">
          <h3 className="column-title">{stage.status_name}</h3>
          <div className="column-badges">
            {(stage.is_completed === 1 || stage.is_completed === true) && (
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

        <div style={{ position: "relative" }} ref={dropdownRef}>
          <button
            className="column-menu-btn"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            ⋯
          </button>
          {dropdownOpen && (
            <div className="column-dropdown">
              <div
                onClick={() => {
                  setDropdownOpen(false);
                  onEditStage(stage);
                }}
              >
                ✏️ Edit Stage
              </div>
              <div
                onClick={() => {
                  setDropdownOpen(false);
                  onRearrange();
                }}
              >
                ↕️ Rearrange Stages
              </div>
              <div className="divider" />
              <div
                className="danger"
                onClick={() => {
                  setDropdownOpen(false);
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
        id={stage.status_id}
        items={tasks.map((t) => t.task_id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-tasks">
          {tasks.map((task) => (
            <TaskCard
              key={task.task_id}
              task={task}
              stage={stage}
              isLastStage={isLastStage}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
              onMoveToNext={onMoveToNext}
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

/* ─── TaskCard ───────────────────────────────────────────────────────────────*/
function TaskCard({
  task,
  stage,
  isLastStage,
  onEdit,
  onDelete,
  onMoveToNext,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.task_id });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={setNodeRef} style={style} className="task-card">
      <div className="task-header">
        <div
          {...listeners}
          {...attributes}
          className="task-drag"
          title="Drag to move"
        >
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
              {!isLastStage && (
                <div
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveToNext(task, stage);
                  }}
                >
                  ➡️ Move to Next Stage
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

/* ─── Shared fetch helper ────────────────────────────────────────────────────*/
function apiFetch(url, method = "GET", body, returnRaw = false) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const promise = fetch(url, opts);
  return returnRaw
    ? promise
    : promise
        .then((r) => r.json())
        .catch((e) => {
          console.error(url, e);
          return {};
        });
}
