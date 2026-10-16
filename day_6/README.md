# Day 6: Relational Database Design & SQL

Welcome to Day 6 of the Web Foundation course. This module covers database schema design, normalization, relationships, constraints, indexing, and SQL queries using a university course enrollment system (`schooldb`).

---

## 📁 Directory Overview

| File | Description |
| :--- | :--- |
| [`schooldb.sql`](./schooldb.sql) | DDL & DML scripts: schema creation, table definitions, foreign keys, constraints, seed data, and schema alterations. |
| [`Queries.sql`](./Queries.sql) | Analytical queries (JOINs, aggregations, outer joins for unenrolled students, and updates). |
| [`school-design.md`](./school-design.md) | Architectural documentation: table explanations, relationship breakdowns, join table rationale, indexing strategy, and SQL vs NoSQL evaluation. |

---

## 🏛️ Schema Overview & Tables

The system models a school environment using three core normalized tables:

1. **`students`**: Stores student biographical profiles.
   - Primary Key: `admission_no` (`VARCHAR(20)`)
   - Unique Constraint: `email` (`VARCHAR(150)`)
   - Columns: `name`, `email`, `phone`
2. **`courses`**: Stores university course catalog records.
   - Primary Key: `course_code` (`VARCHAR(10)`)
   - Check Constraint: `credits > 0`
   - Columns: `course_name`, `lecturer`, `credits`, `department`
3. **`enrolments`**: Associative junction table linking students to courses.
   - Composite Primary Key: `(admission_no, course_code)`
   - Foreign Keys: `admission_no` references `students(admission_no)`, `course_code` references `courses(course_code)`
   - Column: `enrolment_date`

---

## 🔗 Relationships & Join Table Rationale

- **One-to-Many (1:M)**:
  - `students` ➡️ `enrolments`: One student can enroll in multiple courses.
  - `courses` ➡️ `enrolments`: One course can have multiple registered students.
- **Many-to-Many (M:N)**:
  - `students` ↔️ `courses`: A student takes multiple courses; a course is taken by multiple students.
- **Why a Join Table (`enrolments`) is Needed**:
  - Relational engines cannot natively link M:N records without violating First Normal Form (1NF) or causing massive data duplication.
  - The junction table breaks down the M:N relationship into two clean 1:M relationships.
  - It holds relationship-specific metadata (such as `enrolment_date`) while enforcing referential integrity and preventing duplicate enrollments through a composite primary key.

---

## ⚡ Recommended Index

```sql
CREATE INDEX idx_students_name ON students(name);
```

**Reason**: Queries searching for students by name (e.g., `WHERE s.name = 'Amina Wanjiku'`) require a full table scan ($O(n)$) without an index. Adding a B-Tree index on `name` reduces lookup complexity to $O(\log n)$, significantly speeding up query execution as student records grow.

---

## ⚖️ Database Paradigm Choice: SQL vs. NoSQL

**Decision: SQL (Relational Database)**

For this school management system, a relational SQL database is chosen over a NoSQL document/key-value store. Academic records require strict schema enforcement, tabular relationships, and ACID compliance to guarantee that enrollments, course caps, and student identities are strictly synchronized without data corruption. Normalization ensures that course details (like title or lecturer) and student details are stored once, avoiding duplicate and out-of-sync data across records. Furthermore, SQL's standard `JOIN` operations allow seamless aggregation, grade reports, and course roster generation.

---

## 🚀 How to Run the Scripts

To initialize the database and run the queries in MySQL or MariaDB:

```bash
# 1. Log in to MySQL and source the schema and seed data
mysql -u root -p < day_6/schooldb.sql

# 2. Execute the verification queries
mysql -u root -p schooldb < day_6/Queries.sql
```
