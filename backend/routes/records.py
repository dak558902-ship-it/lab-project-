"""
routes/records.py — Usage record management endpoints.

POST   /api/records                → Submit a new usage record
GET    /api/records                → List records (filterable)
GET    /api/records/<id>           → Get a single record
PUT    /api/records/<id>           → Update a record              [JWT required]
DELETE /api/records/<id>           → Delete a record              [JWT required]
GET    /api/records/stats          → Aggregate statistics
GET    /api/records/analytics      → Analytics data (charts)
"""
import json
from datetime import datetime, timezone
from flask import Blueprint, request
from sqlalchemy import func, and_

from models import db, Student, Computer, UsageRecord, AuditLog
from utils.helpers import success, error, admin_required, paginate

records_bp = Blueprint("records", __name__)


# ── Helpers ───────────────────────────────────────────────────

def _time_to_min(hhmm: str) -> int:
    if not hhmm:
        return 0
    parts = hhmm.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _calc_duration(start: str, end: str) -> str:
    diff = _time_to_min(end) - _time_to_min(start)
    if diff <= 0:
        return "0m"
    h, m = divmod(diff, 60)
    if h == 0:
        return f"{m}m"
    if m == 0:
        return f"{h}h"
    return f"{h}h {m}m"


def _find_overlap(computer_code: str, date: str, start: str, end: str, exclude_id=None):
    """Check for time overlap on a computer for a given date."""
    start_min = _time_to_min(start)
    end_min = _time_to_min(end)

    query = UsageRecord.query.filter(
        UsageRecord.computer_code == computer_code,
        UsageRecord.date == date,
    )
    if exclude_id:
        query = query.filter(UsageRecord.id != exclude_id)

    for r in query.all():
        r_start = _time_to_min(r.start_time)
        r_end = _time_to_min(r.end_time)
        if r_start < end_min and start_min < r_end:
            return r
    return None


def _audit(admin: str, action: str, description: str, ip: str = None):
    log = AuditLog(admin=admin, action=action, description=description, ip_address=ip)
    db.session.add(log)
    db.session.commit()


# ══════════════════════════════════════════════════════════════
#  RECORD ENDPOINTS
# ══════════════════════════════════════════════════════════════

# ── POST /api/records ─────────────────────────────────────────
@records_bp.route("/api/records", methods=["POST"])
def submit_record():
    """
    Submit a new usage record.

    Body (JSON):
        computerId     str  required  (e.g. "LAB-PC-01")
        studentName    str  required
        registerNo     str  required
        department     str  required
        year           str  required  (e.g. "1st Year")
        startTime      str  required  (HH:MM)
        endTime        str  required  (HH:MM)
        date           str  optional  (YYYY-MM-DD, defaults to today)
    """
    body = request.get_json(silent=True) or {}

    computer_code = (body.get("computerId") or "").strip().upper()
    student_name  = (body.get("studentName") or "").strip()
    register_no   = (body.get("registerNo") or "").strip().upper()
    department    = (body.get("department") or "").strip()
    year          = (body.get("year") or "").strip()
    start_time    = (body.get("startTime") or "").strip()
    end_time      = (body.get("endTime") or "").strip()
    rec_date      = (body.get("date") or "").strip()

    # Validation
    if not all([computer_code, student_name, register_no, department, year, start_time, end_time]):
        return error("All fields are required: computerId, studentName, registerNo, department, year, startTime, endTime.", 400)

    if _time_to_min(end_time) <= _time_to_min(start_time):
        return error("End time must be later than start time.", 400)

    # Resolve computer
    computer = Computer.query.filter_by(computer_code=computer_code).first()
    if not computer:
        return error(f"Computer '{computer_code}' not found.", 404)
    if not computer.is_online:
        return error("This computer is currently offline.", 409)

    # Date
    if not rec_date:
        rec_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Check overlap
    conflict = _find_overlap(computer_code, rec_date, start_time, end_time)
    if conflict:
        return error("TIME_CONFLICT", 409)

    # Upsert student
    student = Student.query.filter_by(register_number=register_no).first()
    if not student:
        student = Student(
            name=student_name,
            register_number=register_no,
            department=department,
            year=year,
        )
        db.session.add(student)
        db.session.flush()
    else:
        student.name = student_name
        student.department = department
        student.year = year

    # Create record
    duration_min = _time_to_min(end_time) - _time_to_min(start_time)
    record = UsageRecord(
        computer_id=computer.id,
        student_id=student.id,
        student_name=student_name,
        register_number=register_no,
        department=department,
        year=year,
        computer_code=computer_code,
        date=rec_date,
        start_time=start_time,
        end_time=end_time,
        duration=_calc_duration(start_time, end_time),
        duration_minutes=duration_min,
    )
    db.session.add(record)
    db.session.commit()

    return success(data=record.to_dict(), message="Usage record submitted.", status_code=201)


# ── GET /api/records ──────────────────────────────────────────
@records_bp.route("/api/records", methods=["GET"])
def list_records():
    """
    List usage records with filters.

    Query params:
        search        str   search name, reg no, or computer code
        date_from     str   YYYY-MM-DD
        date_to       str   YYYY-MM-DD
        department    str
        year          str
        computerId    str   filter by computer code
        registerNo    str   filter by register number
        page          int   default 1
        per_page      int   default 20, max 100
    """
    search      = (request.args.get("search") or "").strip()
    date_from   = (request.args.get("date_from") or "").strip()
    date_to     = (request.args.get("date_to") or "").strip()
    department  = (request.args.get("department") or "").strip()
    year        = (request.args.get("year") or "").strip()
    computer_id = (request.args.get("computerId") or "").strip().upper()
    register_no = (request.args.get("registerNo") or "").strip().upper()
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = min(100, max(1, int(request.args.get("per_page", 20))))

    query = UsageRecord.query.order_by(UsageRecord.date.desc(), UsageRecord.start_time.desc())

    if search:
        like = f"%{search}%"
        query = query.filter(
            UsageRecord.student_name.ilike(like) |
            UsageRecord.register_number.ilike(like) |
            UsageRecord.computer_code.ilike(like)
        )
    if date_from:
        query = query.filter(UsageRecord.date >= date_from)
    if date_to:
        query = query.filter(UsageRecord.date <= date_to)
    if department and department != "all":
        query = query.filter(UsageRecord.department == department)
    if year and year != "all":
        query = query.filter(UsageRecord.year == year)
    if computer_id and computer_id != "ALL":
        query = query.filter(UsageRecord.computer_code == computer_id)
    if register_no:
        query = query.filter(UsageRecord.register_number.ilike(f"%{register_no}%"))

    result = paginate(query, page, per_page, lambda r: r.to_dict())
    return success(data=result)


# ── GET /api/records/<id> ─────────────────────────────────────
@records_bp.route("/api/records/<int:record_id>", methods=["GET"])
def get_record(record_id: int):
    record = db.get_or_404(UsageRecord, record_id, description="Record not found.")
    return success(data=record.to_dict())


# ── PUT /api/records/<id> ─────────────────────────────────────
@records_bp.route("/api/records/<int:record_id>", methods=["PUT"])
@admin_required
def update_record(record_id: int):
    """Update a usage record. Admin only."""
    record = db.get_or_404(UsageRecord, record_id, description="Record not found.")
    body = request.get_json(silent=True) or {}

    start_time = (body.get("startTime") or record.start_time).strip()
    end_time   = (body.get("endTime") or record.end_time).strip()
    rec_date   = (body.get("date") or record.date).strip()
    comp_code  = (body.get("computerId") or record.computer_code).strip().upper()

    if _time_to_min(end_time) <= _time_to_min(start_time):
        return error("End time must be later than start time.", 400)

    conflict = _find_overlap(comp_code, rec_date, start_time, end_time, exclude_id=record_id)
    if conflict:
        return error("TIME_CONFLICT", 409)

    # Resolve computer if changed
    if comp_code != record.computer_code:
        computer = Computer.query.filter_by(computer_code=comp_code).first()
        if not computer:
            return error(f"Computer '{comp_code}' not found.", 404)
        record.computer_id = computer.id
        record.computer_code = comp_code

    record.student_name    = (body.get("studentName") or record.student_name).strip()
    record.register_number = (body.get("registerNo") or record.register_number).strip().upper()
    record.department      = (body.get("department") or record.department).strip()
    record.year            = (body.get("year") or record.year).strip()
    record.date            = rec_date
    record.start_time      = start_time
    record.end_time        = end_time
    record.duration        = _calc_duration(start_time, end_time)
    record.duration_minutes = _time_to_min(end_time) - _time_to_min(start_time)
    record.edited_at       = datetime.now(timezone.utc)
    record.edited_by       = body.get("adminName", "Admin")

    db.session.commit()

    admin_name = body.get("adminName", "Admin")
    _audit(admin_name, "EDIT_RECORD", f"Updated record #{record_id} for {record.computer_code}")

    return success(data=record.to_dict(), message="Record updated.")


# ── DELETE /api/records/<id> ──────────────────────────────────
@records_bp.route("/api/records/<int:record_id>", methods=["DELETE"])
@admin_required
def delete_record(record_id: int):
    """Delete a usage record. Admin only."""
    record = db.get_or_404(UsageRecord, record_id, description="Record not found.")
    desc = f"Deleted record #{record_id} — {record.computer_code} {record.date}"

    admin_name = request.args.get("admin", "Admin")
    db.session.delete(record)
    db.session.commit()

    _audit(admin_name, "DELETE_RECORD", desc)
    return success(message="Record deleted.")


# ══════════════════════════════════════════════════════════════
#  STATISTICS & ANALYTICS
# ══════════════════════════════════════════════════════════════

@records_bp.route("/api/stats", methods=["GET"])
def get_stats():
    """Dashboard aggregate statistics."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_hhmm = datetime.now(timezone.utc).strftime("%H:%M")

    computers = Computer.query.all()
    total = len(computers)
    offline = sum(1 for c in computers if not c.is_online)
    online_computers = [c for c in computers if c.is_online]

    # Count in-use from today's records
    in_use = 0
    for c in online_computers:
        today_records = UsageRecord.query.filter_by(
            computer_code=c.computer_code, date=today
        ).all()
        for r in today_records:
            if r.start_time <= now_hhmm < r.end_time:
                in_use += 1
                break

    available = total - offline - in_use
    today_records = UsageRecord.query.filter_by(date=today).count()
    total_records = UsageRecord.query.count()
    total_students = Student.query.count()

    return success(data={
        "total": total,
        "available": available,
        "inUse": in_use,
        "offline": offline,
        "todayRecords": today_records,
        "totalRecords": total_records,
        "totalStudents": total_students,
    })


@records_bp.route("/api/analytics", methods=["GET"])
def get_analytics():
    """Analytics data for charts (last 30 days)."""
    days = int(request.args.get("days", 30))
    records = UsageRecord.query.all()

    # Daily counts
    from datetime import timedelta
    daily_counts = {}
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_counts[d] = 0
    for r in records:
        if r.date in daily_counts:
            daily_counts[r.date] += 1

    # Department breakdown
    dept_map = {}
    for r in records:
        dept_map[r.department] = dept_map.get(r.department, 0) + 1

    # Peak hours
    hour_map = {h: 0 for h in range(8, 18)}
    for r in records:
        start_h = int(r.start_time.split(":")[0])
        end_h = int(r.end_time.split(":")[0])
        for h in range(start_h, end_h):
            if h in hour_map:
                hour_map[h] += 1

    # Top computers
    comp_map = {}
    for r in records:
        comp_map[r.computer_code] = comp_map.get(r.computer_code, 0) + (r.duration_minutes or 0)
    top_computers = sorted(comp_map.items(), key=lambda x: x[1], reverse=True)[:10]
    top_computers = [{"code": c, "minutes": m} for c, m in top_computers]

    # Average duration
    total_min = sum(r.duration_minutes or 0 for r in records)
    avg_min = round(total_min / len(records)) if records else 0
    h, m = divmod(avg_min, 60)

    return success(data={
        "dailyCounts": daily_counts,
        "deptBreakdown": dept_map,
        "peakHours": hour_map,
        "topComputers": top_computers,
        "avgDuration": f"{h}h {m}m" if h > 0 else f"{m}m",
        "mostUsed": top_computers[0]["code"] if top_computers else "—",
    })


# ══════════════════════════════════════════════════════════════
#  AUDIT LOG ENDPOINTS
# ══════════════════════════════════════════════════════════════

@records_bp.route("/api/audit", methods=["GET"])
@admin_required
def list_audit():
    """List audit logs with optional filters."""
    search = (request.args.get("search") or "").strip()
    action = (request.args.get("action") or "").strip()
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 50))))

    query = AuditLog.query.order_by(AuditLog.timestamp.desc())

    if search:
        like = f"%{search}%"
        query = query.filter(
            AuditLog.description.ilike(like) | AuditLog.admin.ilike(like)
        )
    if action and action != "all":
        query = query.filter(AuditLog.action == action)

    result = paginate(query, page, per_page, lambda l: l.to_dict())
    return success(data=result)


@records_bp.route("/api/audit", methods=["POST"])
@admin_required
def add_audit():
    """Add an audit log entry."""
    body = request.get_json(silent=True) or {}
    admin_name = (body.get("admin") or "Admin").strip()
    action = (body.get("action") or "").strip()
    description = (body.get("description") or "").strip()

    if not action or not description:
        return error("'action' and 'description' are required.", 400)

    _audit(admin_name, action, description, request.remote_addr)
    return success(message="Audit log entry added.", status_code=201)
