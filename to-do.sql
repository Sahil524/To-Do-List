CREATE DATABASE todo;

USE todo;

CREATE TABLE user_info (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    time TIME NULL,
    priority VARCHAR(20) NOT NULL,
    links TEXT NULL,
    FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

ALTER TABLE tasks ADD done BOOLEAN DEFAULT 0;

ALTER TABLE tasks ADD sort_order INT DEFAULT 0;

INSERT INTO tasks (user_id, title, description, category, date, time, priority, links, done) VALUES
(1, 'Social Media Post', 'Post on Instagram', 'Social Media Posting', '2025-08-11', '10:00:00', 'High', NULL, 0),
(1, 'Team Meeting', 'Weekly sync with dev team', 'Meeting', '2025-08-11', NULL, 'Medium', NULL, 0),
(1, 'Budget Report', 'Prepare Q3 report', 'Budget Planning', '2025-08-10', '14:00:00', 'High', NULL, 1),
(1, 'Client Presentation', 'Pitch new project', 'Client Presentation', '2025-08-12', NULL, 'High', NULL, 0);

