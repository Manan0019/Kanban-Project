-- ============================================================
--  KANBAN DATABASE - COMPLETE SETUP
-- ============================================================

CREATE DATABASE IF NOT EXISTS kanban_db;
USE kanban_db;

-- ============================================================
--  PROJECTS
-- ============================================================
CREATE TABLE projects (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  start_date  DATE         NULL,
  end_date    DATE         NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  STAGES  (columns on the board)
-- ============================================================
CREATE TABLE stages (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  project_id   INT          NOT NULL,
  name         VARCHAR(100) NOT NULL,
  position     INT          NOT NULL DEFAULT 0,
  is_pending   TINYINT(1)   DEFAULT 0,   -- new tasks land here
  is_completed TINYINT(1)   DEFAULT 0,   -- final/done stage
  task_limit   INT          NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================
--  TASKS
-- ============================================================
CREATE TABLE tasks (
  id             INT          AUTO_INCREMENT PRIMARY KEY,
  project_id     INT          NOT NULL,
  status_id      INT          NULL,
  parent_task_id INT          NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  position       INT          DEFAULT 0,
  is_priority    TINYINT(1)   DEFAULT 0,
  start_date     DATE         NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)     REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (status_id)      REFERENCES stages(id)   ON DELETE SET NULL,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)    ON DELETE SET NULL
);

-- ============================================================
--  DONE - verify with:
--  SHOW TABLES;
--  DESCRIBE projects;
--  DESCRIBE stages;
--  DESCRIBE tasks;
-- ============================================================
