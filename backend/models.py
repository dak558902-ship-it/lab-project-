"""
models.py — SQLAlchemy ORM models for SmartLab Monitor.

Models:
  • Student          — auto-registered students
  • Computer         — laboratory computers
  • UsageRecord      — planned usage records (start+end time submitted upfront)
  • Admin            — administrator accounts
  • AuditLog         — administrator action trail
  • Setting          — key-value system configuration
"""
from datetime import datetime, timezone, date, time
from flask_sqlalchemy import SQLAlchemy
import bcrypt

db = SQLAlchemy()


# ══════════════════════════════════════════════════════════════
#  STUDENTS
# ══════════════════════════════════════════════════════════════
class Student(db.Model):
    __tablename__ = "students"

    id              = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    name            = db.Column(db.String(120),  nullable=False)
    register_number = db.Column(db.String(50),   nullable=False, unique=True, index=True)
    department      = db.Column(db.String(100),  nullable=False)
    year            = db.Column(db.String(20),   nullable=False)   # "1st Year" etc.
    created_at      = db.Column(db.DateTime,     nullable=False,
                                default=lambda: datetime.now(timezone.utc))

    # Relationship
    records = db.relationship("UsageRecord", back_populates="student",
                              lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, include_stats: bool = False) -> dict:
        data = {
            "id":              self.id,
            "name":            self.name,
            "register_number": self.register_number,
            "department":      self.department,
            "year":            self.year,
            "created_at":      self.created_at.isoformat(),
        }
        if include_stats:
            records = self.records.all()
            total_min = sum(r.duration_minutes or 0 for r in records)
            h, m = divmod(total_min, 60)
            data["total_records"] = len(records)
            data["total_usage"] = f"{h}h {m}m" if h > 0 else f"{m}m"
            data["avg_duration_min"] = round(total_min / len(records)) if records else 0
            data["last_seen"] = records[-1].date.isoformat() if records else None
        return data

    def __repr__(self) -> str:
        return f"<Student {self.register_number} — {self.name}>"


# ══════════════════════════════════════════════════════════════
#  COMPUTERS
# ══════════════════════════════════════════════════════════════
class Computer(db.Model):
    __tablename__ = "computers"

    id            = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    computer_code = db.Column(db.String(50), nullable=False, unique=True, index=True)
    computer_name = db.Column(db.String(120),nullable=True)
    ip_address    = db.Column(db.String(45), nullable=True)
    location      = db.Column(db.String(120),nullable=True)
    row_letter    = db.Column(db.String(5),  nullable=True)
    is_online     = db.Column(db.Boolean,    nullable=False, default=True)
    last_seen     = db.Column(db.DateTime,   nullable=True,
                              default=lambda: datetime.now(timezone.utc))
    created_at    = db.Column(db.DateTime,   nullable=False,
                              default=lambda: datetime.now(timezone.utc))

    # Relationship
    records = db.relationship("UsageRecord", back_populates="computer",
                              lazy="dynamic", cascade="all, delete-orphan")

    def get_availability(self):
        """
        Derive availability from usage records + current time.
        Returns ('AVAILABLE' | 'IN_USE', active_record_or_None)
        """
        now = datetime.now(timezone.utc)
        today_str = now.strftime("%Y-%m-%d")
        now_hhmm = now.strftime("%H:%M")

        # Find a record for today that covers current time
        today_records = self.records.filter(
            UsageRecord.date == today_str
        ).all()

        for r in today_records:
            if r.start_time <= now_hhmm < r.end_time:
                return "IN_USE", r

        return "AVAILABLE", None

    def to_dict(self, include_availability: bool = False) -> dict:
        data = {
            "id":            self.id,
            "code":          self.computer_code,
            "computer_code": self.computer_code,
            "name":          self.computer_name or self.computer_code,
            "ip":            self.ip_address,
            "location":      self.location,
            "row":           self.row_letter,
            "is_online":     self.is_online,
            "last_seen":     self.last_seen.isoformat() if self.last_seen else None,
            "created_at":    self.created_at.isoformat(),
        }
        if include_availability:
            status, record = self.get_availability()
            data["avail_status"] = status
            data["current_record"] = record.to_dict() if record else None
        return data

    def __repr__(self) -> str:
        return f"<Computer {self.computer_code}>"


# ══════════════════════════════════════════════════════════════
#  USAGE RECORDS
# ══════════════════════════════════════════════════════════════
class UsageRecord(db.Model):
    __tablename__ = "usage_records"

    id               = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    computer_id      = db.Column(db.Integer,    db.ForeignKey("computers.id", ondelete="CASCADE"),
                                 nullable=False, index=True)
    student_id       = db.Column(db.Integer,    db.ForeignKey("students.id", ondelete="CASCADE"),
                                 nullable=True, index=True)
    # Denormalized student fields (for fast reads & if student is deleted)
    student_name     = db.Column(db.String(120), nullable=False)
    register_number  = db.Column(db.String(50),  nullable=False, index=True)
    department       = db.Column(db.String(100), nullable=False)
    year             = db.Column(db.String(20),  nullable=False)
    computer_code    = db.Column(db.String(50),  nullable=False)
    # Time fields
    date             = db.Column(db.String(10),  nullable=False, index=True)   # "YYYY-MM-DD"
    start_time       = db.Column(db.String(5),   nullable=False)               # "HH:MM"
    end_time         = db.Column(db.String(5),   nullable=False)               # "HH:MM"
    duration         = db.Column(db.String(20),  nullable=False)               # "1h 30m"
    duration_minutes = db.Column(db.Integer,     nullable=False, default=0)
    # Metadata
    submitted_at     = db.Column(db.DateTime,    nullable=False,
                                 default=lambda: datetime.now(timezone.utc))
    edited_at        = db.Column(db.DateTime,    nullable=True)
    edited_by        = db.Column(db.String(80),  nullable=True)

    # Relationships
    student  = db.relationship("Student",  back_populates="records")
    computer = db.relationship("Computer", back_populates="records")

    @staticmethod
    def time_to_minutes(hhmm: str) -> int:
        """Convert 'HH:MM' to minutes from midnight."""
        if not hhmm:
            return 0
        parts = hhmm.split(":")
        return int(parts[0]) * 60 + int(parts[1])

    @staticmethod
    def calc_duration(start: str, end: str) -> str:
        """Calculate human-readable duration between two HH:MM strings."""
        diff = UsageRecord.time_to_minutes(end) - UsageRecord.time_to_minutes(start)
        if diff <= 0:
            return "0m"
        h, m = divmod(diff, 60)
        if h == 0:
            return f"{m}m"
        if m == 0:
            return f"{h}h"
        return f"{h}h {m}m"

    @staticmethod
    def format_hhmm(hhmm: str) -> str:
        """Format 'HH:MM' → '09:30 AM'."""
        if not hhmm:
            return "—"
        parts = hhmm.split(":")
        h, m = int(parts[0]), int(parts[1])
        ampm = "PM" if h >= 12 else "AM"
        h12 = h % 12 or 12
        return f"{h12:02d}:{m:02d} {ampm}"

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "computerId":      self.computer_code,
            "computerCode":    self.computer_code,
            "computer_id":     self.computer_id,
            "student_id":      self.student_id,
            "studentName":     self.student_name,
            "registerNo":      self.register_number,
            "department":      self.department,
            "year":            self.year,
            "date":            self.date,
            "startTime":       self.start_time,
            "endTime":         self.end_time,
            "duration":        self.duration,
            "durationMin":     self.duration_minutes,
            "submittedAt":     self.submitted_at.isoformat() if self.submitted_at else None,
            "editedAt":        self.edited_at.isoformat() if self.edited_at else None,
            "editedBy":        self.edited_by,
        }

    def __repr__(self) -> str:
        return f"<UsageRecord #{self.id} {self.computer_code} {self.date} {self.start_time}-{self.end_time}>"


# ══════════════════════════════════════════════════════════════
#  AUDIT LOG
# ══════════════════════════════════════════════════════════════
class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id          = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    admin       = db.Column(db.String(80), nullable=False)
    action      = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text,       nullable=False)
    ip_address  = db.Column(db.String(45), nullable=True)
    timestamp   = db.Column(db.DateTime,   nullable=False,
                            default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "admin":       self.admin,
            "action":      self.action,
            "description": self.description,
            "ip":          self.ip_address,
            "timestamp":   self.timestamp.isoformat(),
        }


# ══════════════════════════════════════════════════════════════
#  SETTINGS (key-value store)
# ══════════════════════════════════════════════════════════════
class Setting(db.Model):
    __tablename__ = "settings"

    key   = db.Column(db.String(80), primary_key=True)
    value = db.Column(db.Text,       nullable=True)

    @staticmethod
    def get(key: str, default: str = "") -> str:
        s = Setting.query.get(key)
        return s.value if s else default

    @staticmethod
    def set(key: str, value: str):
        s = Setting.query.get(key)
        if s:
            s.value = value
        else:
            s = Setting(key=key, value=value)
            db.session.add(s)
        db.session.commit()


# ══════════════════════════════════════════════════════════════
#  ADMINS
# ══════════════════════════════════════════════════════════════
class Admin(db.Model):
    __tablename__ = "admins"

    id            = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    username      = db.Column(db.String(80), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255),nullable=False)
    created_at    = db.Column(db.DateTime,   nullable=False,
                              default=lambda: datetime.now(timezone.utc))

    def set_password(self, plaintext: str) -> None:
        salt = bcrypt.gensalt(rounds=12)
        self.password_hash = bcrypt.hashpw(plaintext.encode(), salt).decode()

    def check_password(self, plaintext: str) -> bool:
        return bcrypt.checkpw(plaintext.encode(), self.password_hash.encode())

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "username":   self.username,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<Admin {self.username}>"
