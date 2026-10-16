CREATE SCHEMA IF NOT EXISTS schooldb;
USE schooldb;

CREATE TABLE students (
    admission_no  VARCHAR(20)  PRIMARY KEY,           
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,       
    phone         VARCHAR(20),                       
    date_admitted DATE         NOT NULL
);

CREATE TABLE courses (
    course_code   VARCHAR(10)  PRIMARY KEY,         
    course_name   VARCHAR(100) NOT NULL,
    lecturer      VARCHAR(100) NOT NULL,
    credits       INT          NOT NULL CHECK (credits > 0),
    department    VARCHAR(100)                        
);

CREATE TABLE enrolments (
    admission_no    VARCHAR(20) NOT NULL,
    course_code     VARCHAR(10) NOT NULL,
    enrolment_date  DATE        NOT NULL,
    PRIMARY KEY (admission_no, course_code),
 
    FOREIGN KEY (admission_no) REFERENCES students (admission_no),
    FOREIGN KEY (course_code)  REFERENCES courses (course_code)
);

INSERT INTO students (admission_no, name, email, phone) VALUES
('ADM001', 'Amina Wanjiku',   'amina.wanjiku@example.com',   '0712345678'),
('ADM002', 'Brian Otieno',    'brian.otieno@example.com',    '0723456789'),
('ADM003', 'Cynthia Achieng', 'cynthia.achieng@example.com', '0712346732'),
('ADM004', 'David Kimani',    'david.kimani@example.com',    '0734567890');

INSERT INTO courses (course_code, course_name, lecturer, department) VALUES
('CS101',  'Introduction to Programming', 'Dr. Mary Njeri',     'Computer Science'),
('NET201', 'Computer Networks',           'Mr. Peter Mutua',    'Computer Science'),
('MAT110', 'Discrete Mathematics',        'Prof. Grace Atieno', 'Mathematics'),
('DB210',  'Database Systems',            'Dr. Samuel Kiptoo',  'Computer Science');

INSERT INTO enrolments (admission_no, course_code, enrolment_date) VALUES
('ADM001', 'CS101',  '2024-09-10'),
('ADM001', 'NET201', '2024-09-10'),
('ADM002', 'CS101',  '2024-09-11'),
('ADM002', 'MAT110', '2024-09-11'),
('ADM003', 'CS101',  '2025-01-20'),
('ADM003', 'NET201', '2025-01-20');

ALTER TABLE students
DROP COLUMN date_admitted;

-- 1. All courses for one student
SELECT s.name, c.course_code, c.course_name, c.lecturer
FROM students s
JOIN enrolments e ON e.admission_no = s.admission_no
JOIN courses c    ON c.course_code  = e.course_code
WHERE s.name = 'Amina Wanjiku';

-- All students on one course
SELECT c.course_name, s.admission_no, s.name, s.email
FROM courses c
JOIN enrolments e ON e.course_code  = c.course_code
JOIN students s   ON s.admission_no = e.admission_no
WHERE c.course_code = 'CS101';

-- Number of students per course
SELECT c.course_code, c.course_name, COUNT(e.admission_no) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_code = c.course_code
GROUP BY c.course_code, c.course_name
ORDER BY student_count DESC;

-- Students with no enrolments
SELECT s.admission_no, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.admission_no = s.admission_no
WHERE e.admission_no IS NULL;

-- Update one enrolment
UPDATE enrolments
SET enrolment_date = '2024-09-12'
WHERE admission_no = 'ADM001'
  AND course_code  = 'NET201';
