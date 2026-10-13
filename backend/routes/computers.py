"""
routes/computers.py — Computer management endpoints.

GET    /api/computers                   → List computers (filterable by status)
POST   /api/computers                   → Add a new computer           [JWT required]
GET    /api/computers/available         → Shortcut: available computers only
GET    /api/computers/<id>              → Get computer details
PUT    /api/computers/<id>              → Update computer info          [JWT required]
DELETE /api/computers/<id>              → Remove a computer             [JWT required]
GET    /api/computers/<id>/history      → Session history for a computer
"""
from flask import Blueprint, request

from models import db, Computer, ComputerStatus, LabSession
from utils.helpers import success, error, admin_required, paginate

computers_bp = Blueprint("computers", __name__, url_prefix="/api/computers")


# ── Validation ────────────────────────────────────────────────
def _validate_computer_body(body: dict, is_update: bool = False) -> list[str]:
    errs = []
    code   = (body.get("computer_code") or "").strip()
    status = (body.get("status") or "").strip()
    ip     = (body.get("ip_address") or "").strip()

    if not is_update and not code:
        errs.append("'computer_code' is required.")
    if code and len(code) > 50:
        errs.append("'computer_code' must be ≤ 50 characters.")
    if status and status not in ComputerStatus.ALL:
        errs.append(f"'status' must be one of: {', '.join(ComputerStatus.ALL)}")
    if ip and len(ip) > 45:
        errs.append("'ip_address' must be ≤ 45 characters.")

    return errs


# ── GET /api/computers ────────────────────────────────────────
@computers_bp.route("", methods=["GET"])
def list_computers():
    """
    List all computers with optional status filter.

    Query params:
        status          str   available | in_use | offline
        q               str   search by code or name
        include_session bool  include active session detail (default false)
        page            int   default 1
        per_page        int   default 50, max 200
    """
    status          = (request.args.get("status") or "").strip()
    q               = (request.args.get("q") or "").strip()
    include_session = request.args.get("include_session", "false").lower() == "true"
    page            = max(1, int(request.args.get("page", 1)))
    per_page        = min(200, max(1, int(request.args.get("per_page", 50))))

    if status and status not in ComputerStatus.ALL:
        return error(f"'status' must be one of: {', '.join(ComputerStatus.ALL)}", 400)

    query = Computer.query.order_by(Computer.computer_code)

    if status:
        query = query.filter(Computer.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            Computer.computer_code.ilike(like) |
            Computer.computer_name.ilike(like)
        )

    result = paginate(
        query, page, per_page,
        lambda c: c.to_dict(include_active_session=include_session)
    )
    return success(data=result)


# ── GET /api/computers/available ──────────────────────────────
@computers_bp.route("/available", methods=["GET"])
def available_computers():
    """
    Return all available computers — quick endpoint for the student terminal.
    No pagination (lab sizes are typically small).
    """
    computers = (Computer.query
                 .filter_by(status=ComputerStatus.AVAILABLE)
                 .order_by(Computer.computer_code)
                 .all())
    return success(data={
        "available_count": len(computers),
        "computers": [c.to_dict() for c in computers],
    })


# ── POST /api/computers ───────────────────────────────────────
@computers_bp.route("", methods=["POST"])
@admin_required
def add_computer():
    """
    Add a new computer. Admin only.

    Body (JSON):
        computer_code  str  required  (unique)
        computer_name  str  optional
        ip_address     str  optional
        status         str  optional  (default: available)
    """
    body = request.get_json(silent=True) or {}
    errs = _validate_computer_body(body)
    if errs:
        return error("Validation failed.", 400, details=errs)

    code = body["computer_code"].strip().upper()
    if Computer.query.filter_by(computer_code=code).first():
        return error(f"Computer code '{code}' already exists.", 409)

    computer = Computer(
        computer_code = code,
        computer_name = (body.get("computer_name") or "").strip() or None,
        ip_address    = (body.get("ip_address") or "").strip() or None,
        status        = body.get("status") or ComputerStatus.AVAILABLE,
    )
    db.session.add(computer)
    db.session.commit()
    return success(data=computer.to_dict(), message="Computer added.", status_code=201)


# ── GET /api/computers/<id> ───────────────────────────────────
@computers_bp.route("/<int:computer_id>", methods=["GET"])
def get_computer(computer_id: int):
    """Get a single computer's details, optionally with its active session."""
    include_session = request.args.get("include_session", "true").lower() == "true"
    computer = db.get_or_404(Computer, computer_id, description="Computer not found.")
    return success(data=computer.to_dict(include_active_session=include_session))


# ── PUT /api/computers/<id> ───────────────────────────────────
@computers_bp.route("/<int:computer_id>", methods=["PUT"])
@admin_required
def update_computer(computer_id: int):
    """
    Update a computer's record. Admin only.

    Body (JSON) — all optional:
        computer_name, ip_address, status
    (computer_code cannot be changed)
    """
    computer = db.get_or_404(Computer, computer_id, description="Computer not found.")
    body = request.get_json(silent=True) or {}

    errs = _validate_computer_body(body, is_update=True)
    if errs:
        return error("Validation failed.", 400, details=errs)

    # Prevent manually setting IN_USE via update (must use session API)
    requested_status = body.get("status")
    if requested_status == ComputerStatus.IN_USE:
        return error(
            "Cannot manually set status to 'in_use'. Use the session API to start a session.",
            400,
        )

    if "computer_name" in body:
        computer.computer_name = (body["computer_name"] or "").strip() or None
    if "ip_address" in body:
        computer.ip_address = (body["ip_address"] or "").strip() or None
    if requested_status:
        computer.status = requested_status

    db.session.commit()
    return success(data=computer.to_dict(), message="Computer updated.")


# ── DELETE /api/computers/<id> ────────────────────────────────
@computers_bp.route("/<int:computer_id>", methods=["DELETE"])
@admin_required
def delete_computer(computer_id: int):
    """
    Remove a computer. Admin only.
    Will fail if the computer has an active session.
    """
    computer = db.get_or_404(Computer, computer_id, description="Computer not found.")
    if computer.status == ComputerStatus.IN_USE:
        return error(
            f"Cannot delete '{computer.computer_code}' — it is currently in use. End the session first.",
            409,
        )
    db.session.delete(computer)
    db.session.commit()
    return success(message=f"Computer '{computer.computer_code}' deleted.")


# ── GET /api/computers/<id>/history ──────────────────────────
@computers_bp.route("/<int:computer_id>/history", methods=["GET"])
def computer_history(computer_id: int):
    """
    Return a computer's session history, paginated.

    Query params:
        page      int  default 1
        per_page  int  default 20, max 100
        status    str  filter: active | completed | aborted
    """
    computer = db.get_or_404(Computer, computer_id, description="Computer not found.")
    page     = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    status   = (request.args.get("status") or "").strip()

    query = computer.sessions.order_by(LabSession.in_time.desc())
    if status:
        query = query.filter(LabSession.status == status)

    result = paginate(
        query, page, per_page,
        lambda s: s.to_dict(include_student=True)
    )
    return success(data={
        "computer": computer.to_dict(),
        "sessions": result,
    })
