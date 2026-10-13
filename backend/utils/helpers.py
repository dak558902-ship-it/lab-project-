"""utils/helpers.py — Shared utility functions."""
from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity


# ── Standard JSON response builders ───────────────────────────

def success(data=None, message: str = "OK", status_code: int = 200):
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    return jsonify(body), status_code


def error(message: str, status_code: int = 400, details=None):
    body = {"success": False, "message": message}
    if details:
        body["details"] = details
    return jsonify(body), status_code


# ── Admin-only decorator ───────────────────────────────────────

def admin_required(fn):
    """Require a valid admin JWT. Returns 401 if missing/invalid."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as exc:
            return error(f"Authentication required: {str(exc)}", 401)
        return fn(*args, **kwargs)
    return wrapper


# ── Pagination helper ──────────────────────────────────────────

def paginate(query, page: int, per_page: int, serializer):
    """
    Paginate a SQLAlchemy query and return a dict with items + metadata.
    `serializer` is called on each ORM row (e.g., lambda s: s.to_dict()).
    """
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return {
        "items":      [serializer(item) for item in pagination.items],
        "total":      pagination.total,
        "page":       pagination.page,
        "per_page":   pagination.per_page,
        "pages":      pagination.pages,
        "has_next":   pagination.has_next,
        "has_prev":   pagination.has_prev,
    }
