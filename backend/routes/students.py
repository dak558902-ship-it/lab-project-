"""
routes/students.py — Student management endpoints.

POST   /api/students                    → Register a new student
GET    /api/students                    → List all students (paginated, filterable)
GET    /api/students/<id>               → Get student details
PUT    /api/students/<id>               → Update student info          [JWT required]
DELETE /api/students/<id>               → Remove a student             [JWT required]
GET    /api/students/<id>/history       → Student's session history
GET    /api/students/lookup/<regno>     → Lookup by register number
"""
from flask import Blueprint, request
from sqlalchemy import or_

from models import db, Student, LabSession
from utils.helpers import success, error, admin_required, paginate

students_bp = Blueprint("students", __name__, url_prefix="/api/students")

# ── Validation ────────────────────────────────────────────────
VALID_DEPARTMENTS = {
    "Computer Science & Engineering",
    "Information Technology",
    "Electronics & Communication",
    "Electrical & Electronics",
    "Mechanical Engineering",
    "Civil Engineering",
    "Artificial Intelligence & Data Science",
    "Cybersecurity",
    "Other",
}


def _validate_student_body(body: dict, is_update: bool = False) -> list[str]:
    """Return a list of validation error messages."""
    errs = []
    name   = (body.get("name") or "").strip()
    regno  = (body.get("register_number") or "").strip()
    dept   = (body.get("department") or "").strip()
    year   = body.get("year")
    section= (body.get("section") or "").strip()

    if not is_update:
        if not name:   errs.append("'name' is required.")
        if not regno:  errs.append("'register_number' is required.")
        if not dept:   errs.append("'department' is required.")
        if year is None: errs.append("'year' is required (1–4).")

    if name and len(name) > 120:
        errs.append("'name' must be ≤ 120 characters.")
    if dept and dept not in VALID_DEPARTMENTS:
        errs.append(f"'department' must be one of: {', '.join(sorted(VALID_DEPARTMENTS))}")
    if year is not None:
        try:
            y = int(year)
            if y not in range(1, 5):
                errs.append("'year' must be an integer between 1 and 4.")
        except (TypeError, ValueError):
            errs.append("'year' must be an integer.")
    if section and len(section) > 10:
        errs.append("'section' must be ≤ 10 characters.")

    return errs


# ── POST /api/students ────────────────────────────────────────
@students_bp.route("", methods=["POST"])
def register_student():
    """
    Register a new student.

    Body (JSON):
        name             str   required
        register_number  str   required  (must be unique)
        department       str   required
        year             int   required  (1–4)
        section          str   optional
    """
    body = request.get_json(silent=True) or {}
    errs = _validate_student_body(body)
    if errs:
        return error("Validation failed.", 400, details=errs)

    regno = body["register_number"].strip().upper()
    if Student.query.filter_by(register_number=regno).first():
        return error(f"Register number '{regno}' is already registered.", 409)

    student = Student(
        name            = body["name"].strip(),
        register_number = regno,
        department      = body["department"].strip(),
        year            = int(body["year"]),
        section         = (body.get("section") or "").strip() or None,
    )
    db.session.add(student)
    db.session.commit()
    return success(data=student.to_dict(), message="Student registered.", status_code=201)


# ── GET /api/students ─────────────────────────────────────────
@students_bp.route("", methods=["GET"])
def list_students():
    """
    List students with optional filters and pagination.

    Query params:
        q           str   search by name or register_number
        department  str   filter by department
        year        int   filter by year
        section     str   filter by section
        page        int   default 1
        per_page    int   default 20, max 100
    """
    q          = (request.args.get("q") or "").strip()
    department = (request.args.get("department") or "").strip()
    year       = request.args.get("year")
    section    = (request.args.get("section") or "").strip()
    page       = max(1, int(request.args.get("page", 1)))
    per_page   = min(100, max(1, int(request.args.get("per_page", 20))))

    query = Student.query.order_by(Student.name)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Student.name.ilike(like),
                Student.register_number.ilike(like))
        )
    if department:
        query = query.filter(Student.department == department)
    if year:
        try:
            query = query.filter(Student.year == int(year))
        except ValueError:
            return error("'year' must be an integer.", 400)
    if section:
        query = query.filter(Student.section == section)

    result = paginate(query, page, per_page, lambda s: s.to_dict())
    return success(data=result)


# ── GET /api/students/lookup/<regno> ─────────────────────────
@students_bp.route("/lookup/<string:regno>", methods=["GET"])
def lookup_by_regno(regno: str):
    """
    Look up a student by register number (case-insensitive).
    Useful from the student terminal before starting a session.
    """
    student = Student.query.filter_by(register_number=regno.upper()).first()
    if not student:
        return error(f"No student found with register number '{regno.upper()}'.", 404)
    return success(data=student.to_dict())


# ── GET /api/students/<id> ────────────────────────────────────
@students_bp.route("/<int:student_id>", methods=["GET"])
def get_student(student_id: int):
    """Get a single student's details."""
    student = db.get_or_404(Student, student_id, description="Student not found.")
    return success(data=student.to_dict())


# ── PUT /api/students/<id> ────────────────────────────────────
@students_bp.route("/<int:student_id>", methods=["PUT"])
@admin_required
def update_student(student_id: int):
    """
    Update a student's record. Admin only.

    Body (JSON) — all fields optional:
        name, department, year, section
    (register_number cannot be changed after registration)
    """
    student = db.get_or_404(Student, student_id, description="Student not found.")
    body = request.get_json(silent=True) or {}

    errs = _validate_student_body(body, is_update=True)
    if errs:
        return error("Validation failed.", 400, details=errs)

    if "name" in body and body["name"]:
        student.name = body["name"].strip()
    if "department" in body and body["department"]:
        student.department = body["department"].strip()
    if "year" in body and body["year"] is not None:
        student.year = int(body["year"])
    if "section" in body:
        student.section = (body["section"] or "").strip() or None

    db.session.commit()
    return success(data=student.to_dict(), message="Student updated.")


# ── DELETE /api/students/<id> ─────────────────────────────────
@students_bp.route("/<int:student_id>", methods=["DELETE"])
@admin_required
def delete_student(student_id: int):
    """
    Remove a student. Admin only.
    Will fail if student has an active session.
    """
    student = db.get_or_404(Student, student_id, description="Student not found.")
    active = student.sessions.filter_by(status="active").first()
    if active:
        return error(
            f"Cannot delete student '{student.name}' — they have an active session (#{active.id}).",
            409,
        )
    db.session.delete(student)
    db.session.commit()
    return success(message=f"Student '{student.name}' deleted.")


# ── GET /api/students/<id>/history ───────────────────────────
@students_bp.route("/<int:student_id>/history", methods=["GET"])
def student_history(student_id: int):
    """
    Return a student's complete session history, paginated.

    Query params:
        page      int  default 1
        per_page  int  default 20, max 100
        status    str  filter: active | completed | aborted
    """
    student = db.get_or_404(Student, student_id, description="Student not found.")
    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    status   = (request.args.get("status") or "").strip()

    query = (student.sessions
             .order_by(LabSession.in_time.desc()))
    if status:
        query = query.filter(LabSession.status == status)

    result = paginate(
        query, page, per_page,
        lambda s: s.to_dict(include_computer=True)
    )
    return success(data={
        "student": student.to_dict(),
        "sessions": result,
    })
