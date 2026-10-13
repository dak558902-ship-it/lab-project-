"""
routes/sessions.py — Lab session management endpoints.

POST   /api/sessions/start              → Start a new lab session
POST   /api/sessions/end                → End an active session
GET    /api/sessions                    → List sessions (filterable)    [JWT required]
GET    /api/sessions/active             → All currently active sessions
GET    /api/sessions/<id>               → Get a single session
DELETE /api/sessions/<id>               → Abort a session               [JWT required]
GET    /api/dashboard/stats             → Aggregate stats for admin     [JWT required]
"""
from datetime import datetime, timezone
from flask import Blueprint, request

from models import db, Student, Computer, LabSession, ComputerStatus, SessionStatus
from utils.helpers import success, error, admin_required, paginate

sessions_bp = Blueprint("sessions", __name__)


# ══════════════════════════════════════════════════════════════
#  SESSION ENDPOINTS
# ══════════════════════════════════════════════════════════════

# ── POST /api/sessions/start ──────────────────────────────────
@sessions_bp.route("/api/sessions/start", methods=["POST"])
def start_session():
    """
    Start a new lab session.

    Business rules:
      • Computer must exist and be AVAILABLE.
      • Student must exist (looked up by register_number or student_id).
      • A student cannot have two concurrent active sessions.

    Body (JSON):
        computer_code    str  required  (preferred) OR
        computer_id      int  required
        register_number  str  required  (preferred) OR
        student_id       int  required
    """
    body = request.get_json(silent=True) or {}

    # ── Resolve Computer ──────────────────────────────────────
    computer = None
    if body.get("computer_code"):
        computer = Computer.query.filter_by(
            computer_code=str(body["computer_code"]).strip().upper()
        ).first()
        if not computer:
            return error(f"Computer '{body['computer_code']}' not found.", 404)
    elif body.get("computer_id"):
        computer = db.session.get(Computer, body["computer_id"])
        if not computer:
            return error(f"Computer ID {body['computer_id']} not found.", 404)
    else:
        return error("Provide 'computer_code' or 'computer_id'.", 400)

    if computer.status != ComputerStatus.AVAILABLE:
        return error(
            f"Computer '{computer.computer_code}' is not available "
            f"(current status: {computer.status}).",
            409,
        )

    # ── Resolve Student ───────────────────────────────────────
    student = None
    if body.get("register_number"):
        student = Student.query.filter_by(
            register_number=str(body["register_number"]).strip().upper()
        ).first()
        if not student:
            return error(
                f"No student found with register number '{body['register_number']}'. "
                "Register the student first via POST /api/students.",
                404,
            )
    elif body.get("student_id"):
        student = db.session.get(Student, body["student_id"])
        if not student:
            return error(f"Student ID {body['student_id']} not found.", 404)
    else:
        return error("Provide 'register_number' or 'student_id'.", 400)

    # ── Check concurrent session ──────────────────────────────
    concurrent = (LabSession.query
                  .filter_by(student_id=student.id, status=SessionStatus.ACTIVE)
                  .first())
    if concurrent:
        return error(
            f"Student '{student.name}' already has an active session "
            f"(Session #{concurrent.id} on {concurrent.computer.computer_code}). "
            "End that session before starting a new one.",
            409,
        )

    # ── Create session ────────────────────────────────────────
    session = LabSession(
        student_id  = student.id,
        computer_id = computer.id,
        status      = SessionStatus.ACTIVE,
    )
    computer.status = ComputerStatus.IN_USE

    db.session.add(session)
    db.session.commit()

    return success(
        data=session.to_dict(include_student=True, include_computer=True),
        message=f"Session started for {student.name} on {computer.computer_code}.",
        status_code=201,
    )


# ── POST /api/sessions/end ────────────────────────────────────
@sessions_bp.route("/api/sessions/end", methods=["POST"])
def end_session():
    """
    End an active lab session and record OUT time + duration.

    Body (JSON):
        session_id      int  preferred OR
        computer_code   str  will find the active session on that computer OR
        register_number str  will find the student's active session
    """
    body = request.get_json(silent=True) or {}

    session = None

    if body.get("session_id"):
        session = db.session.get(LabSession, body["session_id"])
        if not session:
            return error(f"Session ID {body['session_id']} not found.", 404)

    elif body.get("computer_code"):
        computer = Computer.query.filter_by(
            computer_code=str(body["computer_code"]).strip().upper()
        ).first()
        if not computer:
            return error(f"Computer '{body['computer_code']}' not found.", 404)
        session = (LabSession.query
                   .filter_by(computer_id=computer.id, status=SessionStatus.ACTIVE)
                   .first())
        if not session:
            return error(f"No active session found on '{computer.computer_code}'.", 404)

    elif body.get("register_number"):
        student = Student.query.filter_by(
            register_number=str(body["register_number"]).strip().upper()
        ).first()
        if not student:
            return error(f"Student '{body['register_number']}' not found.", 404)
        session = (LabSession.query
                   .filter_by(student_id=student.id, status=SessionStatus.ACTIVE)
                   .first())
        if not session:
            return error(f"No active session for student '{student.name}'.", 404)

    else:
        return error("Provide 'session_id', 'computer_code', or 'register_number'.", 400)

    if session.status != SessionStatus.ACTIVE:
        return error(
            f"Session #{session.id} is already {session.status}. Cannot end it again.",
            409,
        )

    # ── Record end time and compute duration ──────────────────
    now = datetime.now(timezone.utc)
    session.out_time         = now
    session.status           = SessionStatus.COMPLETED
    session.duration_minutes = session.compute_duration()
    session.computer.status  = ComputerStatus.AVAILABLE

    db.session.commit()

    return success(
        data=session.to_dict(include_student=True, include_computer=True),
        message=(
            f"Session ended. Duration: {session.duration_minutes} minute(s) "
            f"({session.duration_minutes // 60}h {session.duration_minutes % 60}m)."
        ),
    )


# ── GET /api/sessions/active ──────────────────────────────────
@sessions_bp.route("/api/sessions/active", methods=["GET"])
def active_sessions():
    """Return all currently active sessions with student and computer details."""
    sessions = (LabSession.query
                .filter_by(status=SessionStatus.ACTIVE)
                .order_by(LabSession.in_time)
                .all())
    return success(data={
        "count":    len(sessions),
        "sessions": [s.to_dict(include_student=True, include_computer=True)
                     for s in sessions],
    })


# ── GET /api/sessions ─────────────────────────────────────────
@sessions_bp.route("/api/sessions", methods=["GET"])
@admin_required
def list_sessions():
    """
    List sessions with filters. Admin only.

    Query params:
        status          str   active | completed | aborted
        date            str   YYYY-MM-DD  (filter by in_time date)
        date_from       str   YYYY-MM-DD
        date_to         str   YYYY-MM-DD
        department      str   filter by student department
        computer_code   str   filter by computer
        page            int   default 1
        per_page        int   default 20, max 100
    """
    status        = (request.args.get("status") or "").strip()
    date          = (request.args.get("date") or "").strip()
    date_from     = (request.args.get("date_from") or "").strip()
    date_to       = (request.args.get("date_to") or "").strip()
    department    = (request.args.get("department") or "").strip()
    computer_code = (request.args.get("computer_code") or "").strip().upper()
    page          = max(1, int(request.args.get("page", 1)))
    per_page      = min(100, max(1, int(request.args.get("per_page", 20))))

    query = (LabSession.query
             .join(LabSession.student)
             .join(LabSession.computer)
             .order_by(LabSession.in_time.desc()))

    if status:
        query = query.filter(LabSession.status == status)
    if date:
        query = query.filter(db.func.date(LabSession.in_time) == date)
    if date_from:
        query = query.filter(db.func.date(LabSession.in_time) >= date_from)
    if date_to:
        query = query.filter(db.func.date(LabSession.in_time) <= date_to)
    if department:
        query = query.filter(Student.department == department)
    if computer_code:
        query = query.filter(Computer.computer_code == computer_code)

    result = paginate(
        query, page, per_page,
        lambda s: s.to_dict(include_student=True, include_computer=True)
    )
    return success(data=result)


# ── GET /api/sessions/<id> ────────────────────────────────────
@sessions_bp.route("/api/sessions/<int:session_id>", methods=["GET"])
def get_session(session_id: int):
    """Get full details for a single session."""
    session = db.get_or_404(LabSession, session_id, description="Session not found.")
    return success(data=session.to_dict(include_student=True, include_computer=True))


# ── DELETE /api/sessions/<id> ─────────────────────────────────
@sessions_bp.route("/api/sessions/<int:session_id>", methods=["DELETE"])
@admin_required
def abort_session(session_id: int):
    """
    Abort an active session (e.g., student left without logging out). Admin only.
    Records the current time as out_time and marks status as 'aborted'.
    """
    session = db.get_or_404(LabSession, session_id, description="Session not found.")
    if session.status != SessionStatus.ACTIVE:
        return error(f"Session #{session_id} is not active (status: {session.status}).", 409)

    now = datetime.now(timezone.utc)
    session.out_time         = now
    session.status           = SessionStatus.ABORTED
    session.duration_minutes = session.compute_duration()
    session.computer.status  = ComputerStatus.AVAILABLE

    db.session.commit()
    return success(
        data=session.to_dict(include_student=True, include_computer=True),
        message=f"Session #{session_id} aborted.",
    )


# ══════════════════════════════════════════════════════════════
#  DASHBOARD STATS
# ══════════════════════════════════════════════════════════════

@sessions_bp.route("/api/dashboard/stats", methods=["GET"])
@admin_required
def dashboard_stats():
    """
    Aggregate stats for the admin dashboard.

    Returns:
        total_computers, available, in_use, offline
        active_sessions
        today_sessions, today_completed, today_aborted
        total_students
    """
    today = datetime.now(timezone.utc).date()

    total_computers = Computer.query.count()
    available       = Computer.query.filter_by(status=ComputerStatus.AVAILABLE).count()
    in_use          = Computer.query.filter_by(status=ComputerStatus.IN_USE).count()
    offline         = Computer.query.filter_by(status=ComputerStatus.OFFLINE).count()

    active_sessions = LabSession.query.filter_by(status=SessionStatus.ACTIVE).count()

    today_sessions  = LabSession.query.filter(
        db.func.date(LabSession.in_time) == today
    ).count()
    today_completed = LabSession.query.filter(
        db.func.date(LabSession.in_time) == today,
        LabSession.status == SessionStatus.COMPLETED,
    ).count()
    today_aborted   = LabSession.query.filter(
        db.func.date(LabSession.in_time) == today,
        LabSession.status == SessionStatus.ABORTED,
    ).count()

    total_students = Student.query.count()

    return success(data={
        "computers": {
            "total":     total_computers,
            "available": available,
            "in_use":    in_use,
            "offline":   offline,
        },
        "sessions": {
            "active":          active_sessions,
            "today_total":     today_sessions,
            "today_completed": today_completed,
            "today_aborted":   today_aborted,
        },
        "students": {
            "total": total_students,
        },
        "as_of": datetime.now(timezone.utc).isoformat(),
    })
