import json
import os
import time
from datetime import datetime
from typing import Any

from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine, text
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder='assets', template_folder='.')
app.config['ADMIN_USERNAME'] = 'admin'
app.config['ADMIN_PASSWORD'] = os.getenv('SMARTLAB_ADMIN_PASSWORD', 'admin123')
DEFAULT_MYSQL_URI = 'mysql+pymysql://smartlab:SmartLab123@localhost:3306/smartlab'
FALLBACK_SQLITE_URI = 'sqlite:///smartlab.db'

app_config_uri = (
    os.getenv('SMARTLAB_DB_URI')
    or os.getenv('MYSQL_DATABASE_URI')
    or os.getenv('DATABASE_URL')
    or DEFAULT_MYSQL_URI
)

try:
    if app_config_uri.startswith('mysql'):
        engine = create_engine(app_config_uri)
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        app_config_uri = app_config_uri
    else:
        app_config_uri = app_config_uri
except Exception:
    app_config_uri = FALLBACK_SQLITE_URI

app.config['SQLALCHEMY_DATABASE_URI'] = app_config_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False


db = SQLAlchemy(app)


class Computer(db.Model):
    __tablename__ = 'computers'

    id = db.Column(db.String(32), primary_key=True)
    label = db.Column(db.String(32), nullable=False)
    status = db.Column(db.String(16), default='AVAILABLE')
    student_name = db.Column(db.String(120), default='')
    department = db.Column(db.String(120), default='')
    last_seen = db.Column(db.String(32), default='')
    current_booking_start = db.Column(db.String(16), default='')
    current_booking_end = db.Column(db.String(16), default='')

    def to_dict(self):
        return {
            'id': self.id,
            'label': self.label,
            'status': self.status,
            'studentName': self.student_name,
            'department': self.department,
            'lastSeen': self.last_seen,
            'currentBooking': self.current_booking_start and self.current_booking_end
            and {
                'start': self.current_booking_start,
                'end': self.current_booking_end,
            }
            or None,
        }


class Student(db.Model):
    __tablename__ = 'students'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(120), nullable=False)
    register_number = db.Column(db.String(32), nullable=False, unique=True)
    department = db.Column(db.String(120), nullable=False)
    year = db.Column(db.String(32), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False, default='student123')

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'registerNumber': self.register_number,
            'department': self.department,
            'year': self.year,
        }


class UsageRecord(db.Model):
    __tablename__ = 'usage_records'

    id = db.Column(db.String(32), primary_key=True)
    student_name = db.Column(db.String(120), nullable=False)
    register_number = db.Column(db.String(32), nullable=False)
    department = db.Column(db.String(120), nullable=False)
    year = db.Column(db.String(32), nullable=False)
    computer_id = db.Column(db.String(32), nullable=False)
    booked_date = db.Column(db.String(32), nullable=False)
    start_time = db.Column(db.String(16), nullable=False)
    end_time = db.Column(db.String(16), nullable=False)
    duration_hours = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(16), default='IN_USE')
    created_at = db.Column(db.String(64), default=lambda: datetime.utcnow().isoformat())

    def to_dict(self):
        return {
            'id': self.id,
            'studentName': self.student_name,
            'registerNumber': self.register_number,
            'department': self.department,
            'year': self.year,
            'computerId': self.computer_id,
            'bookedDate': self.booked_date,
            'startTime': self.start_time,
            'endTime': self.end_time,
            'durationHours': self.duration_hours,
            'status': self.status,
            'createdAt': self.created_at,
        }


def generate_computers():
    computers = []
    for index in range(1, 61):
        pc_number = index
        label = f'LAB-PC-{str(pc_number).zfill(2)}'
        computers.append(
            Computer(
                id=label,
                label=label,
                status='AVAILABLE',
                student_name='',
                department='',
                last_seen=(datetime.utcnow().replace(microsecond=0)).isoformat(),
                current_booking_start='',
                current_booking_end='',
            )
        )
    return computers


def generate_students():
    return [
        Student(id=1, name='Aisha Khan', register_number='20CS101', department='CSE', year='3rd Year'),
        Student(id=2, name='Arun Kumar', register_number='21AI205', department='AI & DS', year='2nd Year'),
        Student(id=3, name='Nandha S', register_number='19EC118', department='ECE', year='4th Year'),
        Student(id=4, name='Farah J', register_number='22EE415', department='EEE', year='1st Year'),
        Student(id=5, name='Karthik P', register_number='23ME112', department='MECH', year='2nd Year'),
    ]


def generate_records():
    return [
        UsageRecord(
            id='R-1001',
            student_name='Aisha Khan',
            register_number='20CS101',
            department='CSE',
            year='3rd Year',
            computer_id='LAB-PC-01',
            booked_date='2026-10-14',
            start_time='09:00',
            end_time='11:00',
            duration_hours=2,
            status='IN_USE',
            created_at='2026-10-14T08:45:00.000Z',
        ),
        UsageRecord(
            id='R-1002',
            student_name='Arun Kumar',
            register_number='21AI205',
            department='AI & DS',
            year='2nd Year',
            computer_id='LAB-PC-08',
            booked_date='2026-10-14',
            start_time='11:30',
            end_time='13:00',
            duration_hours=1.5,
            status='IN_USE',
            created_at='2026-10-14T09:10:00.000Z',
        ),
        UsageRecord(
            id='R-1003',
            student_name='Nandha S',
            register_number='19EC118',
            department='ECE',
            year='4th Year',
            computer_id='LAB-PC-14',
            booked_date='2026-10-14',
            start_time='14:00',
            end_time='15:30',
            duration_hours=1.5,
            status='IN_USE',
            created_at='2026-10-14T10:20:00.000Z',
        ),
    ]


def seed_data():
    if not Computer.query.first():
        db.session.add_all(generate_computers())
    if not Student.query.first():
        db.session.add_all(generate_students())
    if not UsageRecord.query.first():
        db.session.add_all(generate_records())
    db.session.commit()


with app.app_context():
    db.create_all()
    seed_data()


def parse_time_to_minutes(value: str) -> int:
    if not value:
        return 0
    parts = str(value).split(':')
    if len(parts) < 2:
        return 0
    hours = int(parts[0])
    minutes = int(parts[1])
    return hours * 60 + minutes


def get_state_payload():
    return {
        'computers': [computer.to_dict() for computer in Computer.query.order_by(Computer.id).all()],
        'students': [student.to_dict() for student in Student.query.order_by(Student.id).all()],
        'records': [record.to_dict() for record in UsageRecord.query.order_by(UsageRecord.created_at.desc()).all()],
        'settings': {'autoApprove': True, 'conflictDetection': True},
    }


def get_status_summary():
    computers = Computer.query.all()
    total = len(computers)
    available = sum(1 for cpu in computers if cpu.status == 'AVAILABLE')
    in_use = sum(1 for cpu in computers if cpu.status == 'IN_USE')
    offline = sum(1 for cpu in computers if cpu.status == 'OFFLINE')
    return {'total': total, 'available': available, 'inUse': in_use, 'offline': offline}


def validate_no_overlap(booked_date: str, computer_id: str, start_time: str, end_time: str):
    same_computer = UsageRecord.query.filter_by(computer_id=computer_id, booked_date=booked_date).all()
    new_start = parse_time_to_minutes(start_time)
    new_end = parse_time_to_minutes(end_time)
    for record in same_computer:
        existing_start = parse_time_to_minutes(record.start_time)
        existing_end = parse_time_to_minutes(record.end_time)
        if not (new_end <= existing_start or new_start >= existing_end):
            return False
    return True


@app.route('/')
def index_page():
    return send_file('index.html')


@app.route('/index.html')
def index_html_page():
    return send_file('index.html')


@app.route('/student.html')
def student_page():
    return send_file('student.html')


@app.route('/admin.html')
def admin_page():
    return send_file('admin.html')


@app.route('/assets/<path:filename>')
def asset_files(filename):
    return send_from_directory('assets', filename)


@app.route('/api/health')
def health_check():
    try:
        with db.engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        db_name = 'SQLite' if str(app.config['SQLALCHEMY_DATABASE_URI']).startswith('sqlite') else 'MySQL'
        return jsonify({'ok': True, 'status': 'SmartLab backend is running', 'database': f'{db_name} connected'})
    except Exception as exc:
        db_name = 'SQLite' if str(app.config['SQLALCHEMY_DATABASE_URI']).startswith('sqlite') else 'MySQL'
        return jsonify({'ok': False, 'status': 'Database connection failed', 'database': f'{db_name} unavailable', 'error': str(exc)}), 503


@app.route('/api/state')
def get_state():
    return jsonify(get_state_payload())


@app.route('/api/summary')
def get_summary():
    return jsonify(get_status_summary())


@app.route('/api/computers')
def get_computers():
    return jsonify([computer.to_dict() for computer in Computer.query.order_by(Computer.id).all()])


@app.route('/api/students')
def get_students():
    return jsonify([student.to_dict() for student in Student.query.order_by(Student.id).all()])


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    student = Student.query.get(student_id)
    if not student:
        return jsonify({'ok': False, 'message': 'Student not found.'}), 404

    db.session.delete(student)
    db.session.commit()
    return jsonify({'ok': True, 'message': 'Student deleted successfully.'})


@app.route('/api/records')
def get_usage_records():
    return jsonify([record.to_dict() for record in UsageRecord.query.order_by(UsageRecord.created_at.desc()).all()])


@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(silent=True) or request.form.to_dict()
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', '')).strip()
    if username == 'admin' and password == 'admin123':
        return jsonify({'ok': True, 'message': 'Admin login successful'})
    return jsonify({'ok': False, 'message': 'Invalid username or password'}), 401


@app.route('/api/admin/password', methods=['POST'])
def change_admin_password():
    data = request.get_json(silent=True) or request.form.to_dict()
    current_password = str(data.get('currentPassword', '')).strip()
    new_password = str(data.get('newPassword', '')).strip()
    confirm_password = str(data.get('confirmPassword', '')).strip()

    if not current_password or not new_password or not confirm_password:
        return jsonify({'ok': False, 'message': 'Please fill in all password fields.'}), 400

    if new_password != confirm_password:
        return jsonify({'ok': False, 'message': 'New password and confirm password do not match.'}), 400

    if len(new_password) < 6:
        return jsonify({'ok': False, 'message': 'New password must be at least 6 characters long.'}), 400

    stored_password = str(app.config.get('ADMIN_PASSWORD', 'admin123')).strip()
    if current_password != stored_password:
        return jsonify({'ok': False, 'message': 'Current admin password is incorrect.'}), 401

    app.config['ADMIN_PASSWORD'] = new_password
    return jsonify({'ok': True, 'message': 'Admin password updated successfully.'})


@app.route('/api/records', methods=['POST'])
def create_usage_record():
    payload = request.get_json(silent=True) or request.form.to_dict()
    required_fields = [
        'studentName',
        'registerNumber',
        'department',
        'year',
        'computerId',
        'bookedDate',
        'startTime',
        'endTime',
    ]
    missing = [field for field in required_fields if not str(payload.get(field, '')).strip()]
    if missing:
        return jsonify({'ok': False, 'message': 'Please complete all required fields before submitting.'}), 400

    computer_id = str(payload.get('computerId', '')).strip()
    booked_date = str(payload.get('bookedDate', '')).strip()
    start_time = str(payload.get('startTime', '')).strip()
    end_time = str(payload.get('endTime', '')).strip()

    if parse_time_to_minutes(end_time) <= parse_time_to_minutes(start_time):
        return jsonify({'ok': False, 'message': 'End time must be later than start time.'}), 400

    if not validate_no_overlap(booked_date, computer_id, start_time, end_time):
        return jsonify({'ok': False, 'message': 'This computer already has a booking overlapping your selected time slot.'}), 409

    computer = Computer.query.get(computer_id)
    if not computer or computer.status != 'AVAILABLE':
        return jsonify({'ok': False, 'message': 'Selected computer is not available for new bookings.'}), 409

    record_id = f"R-{int(time.time() * 1000)}"
    duration_hours = (parse_time_to_minutes(end_time) - parse_time_to_minutes(start_time)) / 60
    record = UsageRecord(
        id=record_id,
        student_name=str(payload.get('studentName', '')).strip(),
        register_number=str(payload.get('registerNumber', '')).strip(),
        department=str(payload.get('department', '')).strip(),
        year=str(payload.get('year', '')).strip(),
        computer_id=computer_id,
        booked_date=booked_date,
        start_time=start_time,
        end_time=end_time,
        duration_hours=round(duration_hours, 2),
        status='IN_USE',
        created_at=datetime.utcnow().isoformat(),
    )
    db.session.add(record)
    computer.status = 'IN_USE'
    computer.student_name = record.student_name
    computer.department = record.department
    computer.current_booking_start = start_time
    computer.current_booking_end = end_time
    computer.last_seen = datetime.utcnow().isoformat()
    db.session.commit()
    return jsonify({'ok': True, 'record': record.to_dict()})


@app.route('/api/reports/monthly')
def get_monthly_report():
    month = str(request.args.get('month', '')).strip()
    records = UsageRecord.query
    if month:
        records = records.filter(UsageRecord.booked_date.like(f'{month}-%'))
    records = records.order_by(UsageRecord.booked_date.asc(), UsageRecord.created_at.asc()).all()

    total_hours = sum(float(record.duration_hours or 0) for record in records)
    department_totals = {}
    for record in records:
        department_totals[record.department] = department_totals.get(record.department, 0) + 1

    return jsonify({
        'month': month,
        'totalRecords': len(records),
        'totalHours': round(total_hours, 2),
        'byDepartment': department_totals,
        'records': [record.to_dict() for record in records],
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
