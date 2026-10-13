"""
routes/auth.py — Admin authentication endpoints.

POST /api/auth/login      → Authenticate admin, return JWT
POST /api/auth/logout     → Informational (client discards token)
GET  /api/auth/me         → Return current admin profile  [JWT required]
PUT  /api/auth/password   → Change own password           [JWT required]
POST /api/auth/register   → Create a new admin            [JWT required]
"""
from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt_identity

from models import db, Admin
from utils.helpers import success, error, admin_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# ── POST /api/auth/login ──────────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate an admin and return a JWT access token.

    Body (JSON):
        username  str  required
        password  str  required

    Returns:
        200  { token, admin }
        400  missing fields
        401  invalid credentials
    """
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password =  body.get("password") or ""

    if not username or not password:
        return error("'username' and 'password' are required.", 400)

    admin = Admin.query.filter_by(username=username).first()
    if not admin or not admin.check_password(password):
        return error("Invalid username or password.", 401)

    token = create_access_token(identity=str(admin.id))
    return success(
        data={"token": token, "admin": admin.to_dict()},
        message="Login successful.",
    )


# ── POST /api/auth/logout ─────────────────────────────────────
@auth_bp.route("/logout", methods=["POST"])
def logout():
    """
    Stateless logout — the client must discard the token.
    (Stateful token blocklisting can be added with flask-jwt-extended's
    blocklist feature if needed.)
    """
    return success(message="Logged out. Please discard your token.")


# ── GET /api/auth/me ──────────────────────────────────────────
@auth_bp.route("/me", methods=["GET"])
@admin_required
def me():
    """Return the profile of the currently authenticated admin."""
    admin_id = int(get_jwt_identity())
    admin = db.get_or_404(Admin, admin_id, description="Admin not found.")
    return success(data=admin.to_dict())


# ── PUT /api/auth/password ────────────────────────────────────
@auth_bp.route("/password", methods=["PUT"])
@admin_required
def change_password():
    """
    Change the authenticated admin's password.

    Body (JSON):
        current_password  str  required
        new_password      str  required  (min 8 chars)
    """
    admin_id = int(get_jwt_identity())
    admin = db.get_or_404(Admin, admin_id)

    body = request.get_json(silent=True) or {}
    current  = body.get("current_password") or ""
    new_pass = body.get("new_password") or ""

    if not current or not new_pass:
        return error("'current_password' and 'new_password' are required.", 400)
    if not admin.check_password(current):
        return error("Current password is incorrect.", 401)
    if len(new_pass) < 8:
        return error("New password must be at least 8 characters.", 400)

    admin.set_password(new_pass)
    db.session.commit()
    return success(message="Password changed successfully.")


# ── POST /api/auth/register ───────────────────────────────────
@auth_bp.route("/register", methods=["POST"])
@admin_required
def register_admin():
    """
    Create a new admin account. Requires an existing admin JWT.

    Body (JSON):
        username  str  required
        password  str  required  (min 8 chars)
    """
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password =  body.get("password") or ""

    if not username or not password:
        return error("'username' and 'password' are required.", 400)
    if len(password) < 8:
        return error("Password must be at least 8 characters.", 400)
    if Admin.query.filter_by(username=username).first():
        return error(f"Username '{username}' is already taken.", 409)

    new_admin = Admin(username=username)
    new_admin.set_password(password)
    db.session.add(new_admin)
    db.session.commit()
    return success(data=new_admin.to_dict(), message="Admin created.", status_code=201)
