"""
app.py — Smart Computer Lab Data Logger
Flask application factory and entry point.

Usage:
    # Development
    python app.py

    # Production (Gunicorn)
    gunicorn -w 4 -b 0.0.0.0:5000 "app:create_app()"
"""
import os
import logging
from flask import Flask, jsonify, send_from_directory
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from config import Config
from models import db, Admin

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
#  APPLICATION FACTORY
# ══════════════════════════════════════════════════════════════
def create_app(config_class=Config) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ── Extensions ────────────────────────────────────────────
    db.init_app(app)
    JWTManager(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})  # Tighten in production

    # ── Blueprints ────────────────────────────────────────────
    from routes.auth      import auth_bp
    from routes.students  import students_bp
    from routes.computers import computers_bp
    from routes.sessions  import sessions_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(students_bp)
    app.register_blueprint(computers_bp)
    app.register_blueprint(sessions_bp)

    # ── Global error handlers ─────────────────────────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify(success=False, message=str(e)), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify(success=False, message="Authentication required."), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify(success=False, message="You do not have permission."), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(success=False, message=str(e)), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify(success=False, message=f"Method not allowed: {str(e)}"), 405

    @app.errorhandler(409)
    def conflict(e):
        return jsonify(success=False, message=str(e)), 409

    @app.errorhandler(500)
    def internal_error(e):
        logger.error("Internal server error: %s", e, exc_info=True)
        db.session.rollback()
        return jsonify(success=False, message="Internal server error."), 500

    # ── Student terminal ──────────────────────────────────────
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    @app.route("/student")
    def student_terminal():
        """Serve the student session terminal page."""
        return send_from_directory(frontend_dir, "student.html")

    @app.route("/admin")
    def admin_dashboard():
        """Serve the admin dashboard page."""
        return send_from_directory(frontend_dir, "admin.html")

    @app.route("/computer.js")
    def computer_js():
        """
        Serve a per-machine JS config snippet.
        Reads COMPUTER_ID from this server's .env and exposes it as
        window.__COMPUTER_ID so student.html can auto-identify the terminal.
        """
        computer_id = app.config.get("COMPUTER_ID", "")
        js = f"window.__COMPUTER_ID = {repr(computer_id)};"
        return app.response_class(js, mimetype="application/javascript")

    @app.route("/api/terminal/identity", methods=["GET"])
    def terminal_identity():
        """
        Return the configured computer identity for this machine.

        Priority (highest → lowest):
          1. COMPUTER_ID env var / .env on this machine
          2. Empty string — client falls back to ?pc= URL param

        Response:
            { "computer_id": "LAB-PC-12", "configured": true }
        """
        computer_id = app.config.get("COMPUTER_ID", "")
        return jsonify(
            success=True,
            data={
                "computer_id": computer_id,
                "configured": bool(computer_id),
            }
        )

    # ── Health check ──────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        """Quick health check endpoint."""
        try:
            db.session.execute(db.text("SELECT 1"))
            db_status = "ok"
        except Exception as exc:
            db_status = f"error: {exc}"
        return jsonify({
            "status":   "ok" if db_status == "ok" else "degraded",
            "database": db_status,
            "version":  "1.0.0",
        })

    # ── DB init + seed ────────────────────────────────────────
    with app.app_context():
        _init_db(app)

    return app


def _init_db(app: Flask) -> None:
    """Create all tables and seed a default admin if none exists."""
    db.create_all()
    logger.info("Database tables verified/created.")

    if Admin.query.count() == 0:
        username = app.config["ADMIN_DEFAULT_USERNAME"]
        password = app.config["ADMIN_DEFAULT_PASSWORD"]
        admin = Admin(username=username)
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        logger.info(
            "Default admin '%s' created. Change the password immediately!", username
        )
    else:
        logger.info("Admin accounts exist; skipping seed.")


# ══════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    application = create_app()
    port = int(os.environ.get("PORT", 5000))
    application.run(
        host="0.0.0.0",
        port=port,
        debug=Config.DEBUG,
    )
