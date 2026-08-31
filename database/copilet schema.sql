CREATE DATABASE IF NOT EXISTS kanban_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE kanban_db;

DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS stages;
DROP TABLE IF EXISTS projects;

CREATE TABLE projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE stages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    position INT NOT NULL DEFAULT 1,
    is_completed TINYINT(1) NOT NULL DEFAULT 0,
    task_limit INT DEFAULT NULL,
    is_pending TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_stages_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_project_stage_position (project_id, position)
);

CREATE TABLE tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    status_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    position INT NOT NULL DEFAULT 0,
    is_priority TINYINT(1) NOT NULL DEFAULT 0,
    parent_task_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_tasks_stage
        FOREIGN KEY (status_id)
        REFERENCES stages(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_tasks_parent
        FOREIGN KEY (parent_task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,
    KEY idx_tasks_project_status (project_id, status_id, position),
    KEY idx_tasks_parent (parent_task_id)
);

INSERT INTO projects (name, description, start_date, end_date)
VALUES (
    'Demo Project',
    'Sample project for testing the Kanban board',
    CURDATE(),
    DATE_ADD(CURDATE(), INTERVAL 7 DAY)
);

SET @project_id = LAST_INSERT_ID();

INSERT INTO stages (project_id, name, position, is_completed, is_pending)
VALUES
    (@project_id, 'Pending', 1, 0, 1),
    (@project_id, 'In Progress', 2, 0, 0),
    (@project_id, 'Completed', 3, 1, 0);

INSERT INTO tasks (project_id, status_id, title, description, position, is_priority)
VALUES
    (
        @project_id,
        (SELECT id FROM stages WHERE project_id = @project_id AND name = 'Pending' LIMIT 1),
        'Task 1',
        'First sample task',
        0,
        1
    ),
    (
        @project_id,
        (SELECT id FROM stages WHERE project_id = @project_id AND name = 'In Progress' LIMIT 1),
        'Task 2',
        'Second sample task',
        0,
        0
    );
