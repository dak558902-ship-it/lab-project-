# Smart Computer Lab Data Logger — Flask Backend

A REST API backend for the Lab Computer Management System.  
**Stack:** Python · Flask · SQLAlchemy · MySQL · JWT (flask-jwt-extended) · bcrypt

---

## Quick Start

### 1. Prerequisites

- Python 3.10+
- MySQL 8.0+ (database must exist before running)

```sql
CREATE DATABASE smart_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Install dependencies

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your actual values
```

**Required `.env` keys:**

| Key | Description |
|---|---|
| `SECRET_KEY` | Random Flask secret (generate with `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `JWT_SECRET_KEY` | Random JWT secret (generate same as above) |
| `ADMIN_DEFAULT_PASSWORD` | Password for the first admin (change after first login) |

### 4. Run

```bash
python app.py
```

The server starts on **http://localhost:5000**.  
Tables are created automatically on first run.  
A default admin (`admin` / your `ADMIN_DEFAULT_PASSWORD`) is seeded if no admin exists.

---

## API Reference

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check + DB status |

---

### Auth  (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login, returns JWT |
| POST | `/api/auth/logout` | — | Informational logout |
| GET | `/api/auth/me` | JWT | Current admin profile |
| PUT | `/api/auth/password` | JWT | Change own password |
| POST | `/api/auth/register` | JWT | Create new admin |

**Login example:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

---

### Students  (`/api/students`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/students` | — | Register a student |
| GET | `/api/students` | — | List students (paginated) |
| GET | `/api/students/lookup/<regno>` | — | Lookup by register number |
| GET | `/api/students/<id>` | — | Get student |
| PUT | `/api/students/<id>` | JWT | Update student |
| DELETE | `/api/students/<id>` | JWT | Delete student |
| GET | `/api/students/<id>/history` | — | Session history |

**Query params for list:** `q`, `department`, `year`, `section`, `page`, `per_page`

---

### Computers  (`/api/computers`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/computers` | — | List computers |
| GET | `/api/computers/available` | — | Available computers only |
| POST | `/api/computers` | JWT | Add computer |
| GET | `/api/computers/<id>` | — | Get computer |
| PUT | `/api/computers/<id>` | JWT | Update computer |
| DELETE | `/api/computers/<id>` | JWT | Delete computer |
| GET | `/api/computers/<id>/history` | — | Session history |

**Query params for list:** `status`, `q`, `include_session`, `page`, `per_page`

---

### Sessions  (`/api/sessions`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/sessions/start` | — | Start a session |
| POST | `/api/sessions/end` | — | End a session |
| GET | `/api/sessions/active` | — | All active sessions |
| GET | `/api/sessions` | JWT | List sessions (filtered) |
| GET | `/api/sessions/<id>` | — | Get session |
| DELETE | `/api/sessions/<id>` | JWT | Abort session |

**Start session body:**
```json
{ "computer_code": "LAB-01", "register_number": "21CS001" }
```

**End session body (any one):**
```json
{ "session_id": 42 }
{ "computer_code": "LAB-01" }
{ "register_number": "21CS001" }
```

**List query params:** `status`, `date`, `date_from`, `date_to`, `department`, `computer_code`, `page`, `per_page`

---

### Dashboard

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard/stats` | JWT | Aggregate stats |

---

## Response Format

All responses follow this envelope:

```json
{
  "success": true,
  "message": "OK",
  "data": { ... }
}
```

Errors:
```json
{
  "success": false,
  "message": "Validation failed.",
  "details": ["'name' is required.", "'year' must be 1–4."]
}
```

---

## Security Notes

- Passwords are hashed with **bcrypt (cost=12)** — never stored in plaintext.
- JWTs expire after 8 hours (configurable via `JWT_ACCESS_TOKEN_EXPIRES_HOURS`).
- All secrets are loaded from environment variables — nothing is hardcoded.
- CORS is open (`*`) for development. **Restrict `origins` in production.**
- Use HTTPS in production (via nginx / reverse proxy).
