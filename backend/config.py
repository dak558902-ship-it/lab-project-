"""
config.py — Application configuration loaded entirely from environment variables.
Never hardcode secrets here. Use a .env file locally (see .env.example).
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

# Load .env file if present (development only; in production, set env vars directly)
load_dotenv()


def _get(key: str, default: str = "") -> str:
    """Get an env var with a fallback default."""
    return os.environ.get(key, default)


def _build_db_uri() -> str:
    """
    Build the database URI.
    Priority:
      1. DATABASE_URL env var (explicit full URI)
      2. DB_USER + DB_PASSWORD → MySQL connection
      3. Fallback → SQLite (zero-config for development)
    """
    # Explicit full URI takes priority
    full_uri = os.environ.get("DATABASE_URL", "").strip()
    if full_uri:
        return full_uri

    # If MySQL credentials are provided, use MySQL
    db_user = os.environ.get("DB_USER", "").strip()
    db_pass = os.environ.get("DB_PASSWORD", "").strip()
    if db_user and db_pass:
        host = os.environ.get("DB_HOST", "localhost")
        port = os.environ.get("DB_PORT", "3306")
        name = os.environ.get("DB_NAME", "smart_lab")
        return f"mysql+pymysql://{db_user}:{db_pass}@{host}:{port}/{name}?charset=utf8mb4"

    # Fallback: SQLite (zero-config development)
    db_dir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(db_dir, "smartlab.db")
    return f"sqlite:///{db_path}"


class Config:
    # ── Flask ──────────────────────────────────────────────────
    SECRET_KEY: str = _get("SECRET_KEY", "dev-secret-change-me-in-production")
    DEBUG: bool     = _get("FLASK_DEBUG", "1") == "1"

    # ── Database ───────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI: str = _build_db_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "pool_pre_ping": True,
    }

    # ── JWT ────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = _get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(
        hours=int(_get("JWT_ACCESS_TOKEN_EXPIRES_HOURS", "8"))
    )
    JWT_TOKEN_LOCATION: list = ["headers"]
    JWT_HEADER_NAME: str  = "Authorization"
    JWT_HEADER_TYPE: str  = "Bearer"

    # ── Seeded default admin (first run only) ──────────────────
    ADMIN_DEFAULT_USERNAME: str = _get("ADMIN_DEFAULT_USERNAME", "admin")
    ADMIN_DEFAULT_PASSWORD: str = _get("ADMIN_DEFAULT_PASSWORD", "admin123")

    # ── Terminal identity (set per machine) ─────────────────────
    COMPUTER_ID: str = _get("COMPUTER_ID", "").strip().upper()
