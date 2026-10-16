# School Database Design & Architecture

This document provides an overview and architectural rationale for the `schooldb` relational database management system implemented in Day 6.

---

## 1. Explanation of Tables

### `students`
- **Purpose**: Stores student profiles and registration information.
- **Primary Key**: `admission_no` (`VARCHAR(20)`) — uniquely identifies each student record.
- **Key Columns**:
  - `name` (`VARCHAR(100)`): Full name of the student (non-nullable).
  - `email` (`VARCHAR(150)`): Student institutional email, enforced as `UNIQUE` to avoid duplicate registrations.
  - `phone` (`VARCHAR(20)`): Contact phone number.

### `courses`
- **Purpose**: Represents academic catalog offerings available within university departments.
- **Primary Key**: `course_code` (`VARCHAR(10)`) — unique departmental course identifier (e.g., `CS101`, `NET201`).
- **Key Columns**:
  - `course_name` (`VARCHAR(100)`): Descriptive title of the course.
  - `lecturer` (`VARCHAR(100)`): Academic instructor responsible for teaching the course.
  - `credits` (`INT`): Credit weight, validated with a `CHECK (credits > 0)` constraint.
  - `department` (`VARCHAR(100)`): Academic department offering the unit.

### `enrolments`
- **Purpose**: Serves as the junction (join / associative) table representing student course registrations.
- **Primary Key**: Composite key `(admission_no, course_code)` — guarantees a student cannot enroll in the same course more than once.
- **Foreign Keys**:
  - `admission_no` references `students(admission_no)`
  - `course_code` references `courses(course_code)`
- **Key Columns**:
  - `enrolment_date` (`DATE`): Timestamp of when the student registered for the course.

---

## 2. Relationships

```
+------------+          1 : M          +--------------+          M : 1          +-----------+
|  STUDENTS  | ----------------------> |  ENROLMENTS  | <---------------------- |  COURSES  |
+------------+                         +--------------+                         +-----------+
      \                                                                               /
       \_______________________________  M : N  _____________________________________/
```

### One-to-Many (1:M) Relationships
1. **`students` to `enrolments` (1:M)**: A single student can have zero, one, or many course enrollment records. Each record in `enrolments` corresponds to exactly one student.
2. **`courses` to `enrolments` (1:M)**: A single course offering can have zero, one, or many students enrolled in it. Each record in `enrolments` corresponds to exactly one course.

### Many-to-Many (M:N) Relationship
- **`students` to `courses` (M:N)**: A student can enroll in multiple courses, and conversely, a course can be taken by multiple students.

### Why a Join Table is Needed
In relational database design, a relational engine cannot natively represent a many-to-many relationship in a single table without breaking database normalization rules:
- **Prevents 1NF Violations**: Without a join table, one would have to store comma-delimited lists of course codes in the `students` table or student IDs in the `courses` table, violating First Normal Form (atomicity).
- **Eliminates Redundancy & Update Anomalies**: Repeating entire student rows for every course taken causes massive data duplication, wasting storage and causing anomalies during updates and deletes.
- **Stores Relationship-Specific Attributes**: The join table provides a dedicated home for attributes that belong strictly to the interaction between a student and a course—such as `enrolment_date`, grades, attendance, or enrollment status.
- **Enforces Referential Integrity**: It enables composite primary keys `(admission_no, course_code)` and foreign key constraints to ensure only valid existing students and courses can be linked.

---

## 3. Recommended Index and Rationale

### Index Definition
```sql
CREATE INDEX idx_students_name ON students(name);
```

### Rationale
In real-world university management workflows and within our analytical queries, searching for students by name (e.g., `WHERE s.name = 'Amina Wanjiku'`) is an extremely frequent operation performed by administrative staff and student lookup portals.

By default, without an index on `students.name`, the database engine must execute a **Full Table Scan ($O(n)$ complexity)**, reading every single record on disk to evaluate matches. Adding a B-Tree index on `name` reduces lookup and range-scan time complexity to **$O(\log n)$**, drastically reducing I/O operations and accelerating `WHERE`, `ORDER BY`, and join filtering as the student population scales to thousands or millions of records.

*(Additional beneficial index: In systems with high enrollment volume, `CREATE INDEX idx_enrolments_course_code ON enrolments(course_code);` optimizes course roster lookups and joins originating from the `courses` table).*

---

## 4. Architectural Choice: SQL vs. NoSQL

**Choice: SQL (Relational Database)**

For this school management and enrollment system, a relational SQL database is the superior architectural choice over a NoSQL alternative. The domain model consists of highly structured, tabular entities (`students`, `courses`, `enrolments`) connected by strict relational rules and constraints. SQL provides native ACID (Atomicity, Consistency, Isolation, Durability) guarantees, which are mission-critical for academic operations—such as ensuring a student cannot be double-enrolled or registered for invalid course codes, and preventing race conditions during course capacity allocations. Furthermore, normalized relational schemas eliminate data duplication; if a course title or lecturer changes, it is updated in a single row without the risk of stale, desynchronized copies that occur in nested document stores like MongoDB. Finally, SQL's declarative querying engine and `JOIN` operations allow reporting rosters, transcripts, and faculty workload analytics via standardized, performant queries.
