-- School Database Queries
USE schooldb;

-- 1. All courses for one student
SELECT s.name, c.course_code, c.course_name, c.lecturer
FROM students s
JOIN enrolments e ON e.admission_no = s.admission_no
JOIN courses c    ON c.course_code  = e.course_code
WHERE s.name = 'Amina Wanjiku';

-- 2. All students on one course
SELECT c.course_name, s.admission_no, s.name, s.email
FROM courses c
JOIN enrolments e ON e.course_code  = c.course_code
JOIN students s   ON s.admission_no = e.admission_no
WHERE c.course_code = 'CS101';

-- 3. Number of students per course
SELECT c.course_code, c.course_name, COUNT(e.admission_no) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_code = c.course_code
GROUP BY c.course_code, c.course_name
ORDER BY student_count DESC;

-- 4. Students with no enrolments
SELECT s.admission_no, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.admission_no = s.admission_no
WHERE e.admission_no IS NULL;

-- 5. Update one enrolment date
UPDATE enrolments
SET enrolment_date = '2024-09-12'
WHERE admission_no = 'ADM001'
  AND course_code  = 'NET201';
