import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  DndContext,
  closestCenter,
  useDroppable,
  DragOverlay,
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

function Board() {
  const { id } = useParams();

  const [stages, setStages] = useState([]);
  const [tasksByColumn, setTasksByColumn] = useState({});
  const [activeTask, setActiveTask] = useState(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  const [showStageModal, setShowStageModal] = useState(false);
  const [stageName, setStageName] = useState("");

  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    fetchStages();
    fetchTasks();
  }, [id]);

  const fetchStages = async () => {
    const res = await fetch(`http://localhost:5000/api/projects/${id}/stages`);
    const data = await res.json();
    setStages(data.sort((a, b) => a.order_number - b.order_number));
  };

  const fetchTasks = async () => {
    const res = await fetch(`http://localhost:5000/api/tasks/project/${id}`);
    const data = await res.json();

    const grouped = {};
    data.forEach((task) => {
      if (!grouped[task.status_id]) grouped[task.status_id] = [];
      grouped[task.status_id].push(task);
    });

    setTasksByColumn(grouped);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const source = active.data.current?.sortable?.containerId;
    const target = over.data.current?.sortable?.containerId || over.id;

    if (!source || !target) return;

    if (source === target) {
      const oldIndex = tasksByColumn[source].findIndex(
        (t) => t.task_id === active.id,
      );
      const newIndex = tasksByColumn[source].findIndex(
        (t) => t.task_id === over.id,
      );

      const reordered = arrayMove(tasksByColumn[source], oldIndex, newIndex);

      setTasksByColumn({ ...tasksByColumn, [source]: reordered });
    } else {
      const sourceTasks = [...tasksByColumn[source]];
      const targetTasks = [...(tasksByColumn[target] || [])];

      const index = sourceTasks.findIndex((t) => t.task_id === active.id);
      const [moved] = sourceTasks.splice(index, 1);

      targetTasks.push({ ...moved, status_id: Number(target) });

      setTasksByColumn({
        ...tasksByColumn,
        [source]: sourceTasks,
        [target]: targetTasks,
      });
    }
  };

  const handleSaveTask = async () => {
    const firstStageId = stages[0]?.status_id;
    if (!firstStageId) return;

    if (editingTask) {
      await fetch(`http://localhost:5000/api/tasks/${editingTask.task_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
        }),
      });
    } else {
      await fetch("http://localhost:5000/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          status_id: firstStageId,
          title: taskTitle,
          description: taskDescription,
        }),
      });
    }

    fetchTasks();
    setShowTaskModal(false);
    setEditingTask(null);
    setTaskTitle("");
    setTaskDescription("");
  };

  return (
    <div className="board-container">
      <h1 className="board-title">Kanban Board</h1>

      <div className="board-actions">
        <button
          className="board-btn primary"
          onClick={() => setShowTaskModal(true)}
        >
          + Create Task
        </button>

        <button
          className="board-btn secondary"
          onClick={() => setShowStageModal(true)}
        >
          + Create Stage
        </button>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="stages-wrapper">
          {stages.map((stage) => (
            <Column
              key={stage.status_id}
              stage={stage}
              tasks={tasksByColumn[stage.status_id] || []}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="task-card">
              <strong>{activeTask.title}</strong>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showTaskModal && (
        <Modal onClose={() => setShowTaskModal(false)}>
          <h2>{editingTask ? "Edit Task" : "Create Task"}</h2>
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Task Title"
          />
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Description"
          />
          <button onClick={handleSaveTask}>Save</button>
        </Modal>
      )}
    </div>
  );
}

function Column({ stage, tasks }) {
  const { setNodeRef } = useDroppable({ id: stage.status_id });

  return (
    <div ref={setNodeRef} className="column">
      <div className="column-header">
        <h3 className="column-title">{stage.status_name}</h3>
      </div>

      <SortableContext
        id={stage.status_id}
        items={tasks.map((t) => t.task_id)}
        strategy={verticalListSortingStrategy}
      >
        {tasks.map((task) => (
          <TaskCard key={task.task_id} task={task} />
        ))}
      </SortableContext>
    </div>
  );
}

function TaskCard({ task }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.task_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="task-card">
      <div className="task-header">
        <div {...listeners} {...attributes} className="task-drag">
          ≡
        </div>
      </div>
      <div className="task-title">{task.title}</div>
      <div className="task-description">{task.description}</div>
    </div>
  );
}

export default Board;
