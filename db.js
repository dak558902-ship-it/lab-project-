/**
 * SmartLab Monitor — Data Layer (db.js)
 *
 * WORKFLOW: Usage-record based (NOT session-based).
 * Students submit Start Time + End Time before usage begins.
 * Computer status is derived from records + current time.
 * No "active session" concept — only planned/completed usage records.
 *
 * Storage: localStorage (prefixed keys for isolation)
 */

const DB = (() => {
  const KEYS = {
    COMPUTERS:    'slm_computers',
    RECORDS:      'slm_records',
    STUDENTS:     'slm_students',
    SETTINGS:     'slm_settings',
    AUDIT:        'slm_audit',
    NOTIFS:       'slm_notifs',
  };

  /* ───────────────────────────────────────────────────────────────
     Helpers
  ─────────────────────────────────────────────────────────────── */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Convert "HH:MM" to minutes-from-midnight */
  function timeToMinutes(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  /** Duration between two "HH:MM" strings → "{h}h {m}m" */
  function calcDuration(startHHMM, endHHMM) {
    const diff = timeToMinutes(endHHMM) - timeToMinutes(startHHMM);
    if (diff <= 0) return '0m';
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  /** Duration in minutes between two "HH:MM" strings */
  function durationMinutes(startHHMM, endHHMM) {
    return timeToMinutes(endHHMM) - timeToMinutes(startHHMM);
  }

  /** Format "HH:MM" → "09:30 AM" */
  function formatHHMM(hhmm) {
    if (!hhmm) return '—';
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  /** Format ISO date → "07 Oct 2026" */
  function formatDatePretty(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** Current time as "HH:MM" */
  function currentHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }

  /**
   * Determine computer availability from records.
   * AVAILABLE — no record covers current time today.
   * IN_USE    — a record for today covers current time.
   */
  function getComputerAvailability(computerId) {
    const today = todayISO();
    const now   = currentHHMM();
    const nowMin = timeToMinutes(now);
    const records = getRecords().filter(r =>
      r.computerId === computerId && r.date === today
    );
    const active = records.find(r =>
      timeToMinutes(r.startTime) <= nowMin && nowMin < timeToMinutes(r.endTime)
    );
    return active ? { status: 'IN_USE', record: active } : { status: 'AVAILABLE', record: null };
  }

  /* ───────────────────────────────────────────────────────────────
     Settings
  ─────────────────────────────────────────────────────────────── */
  function getSettings() {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (!raw) {
      const defaults = {
        adminUser:      'admin',
        adminPass:      'admin123',
        labName:        'Computer Laboratory',
        instituteName:  'Engineering College',
        totalComputers: 60,
        timezone:       'Asia/Kolkata',
        heartbeatInterval: 30,
        offlineTimeout:    120,
        departments: ['AI & DS', 'CSE', 'ECE', 'EEE', 'IT', 'MECH', 'CIVIL', 'Other'],
        academicYears: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
      };
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(raw);
  }

  function saveSettings(patch) {
    const s = getSettings();
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...s, ...patch }));
  }

  function verifyAdmin(user, pass) {
    const s = getSettings();
    return s.adminUser === user && s.adminPass === pass;
  }

  /* ───────────────────────────────────────────────────────────────
     Computers
  ─────────────────────────────────────────────────────────────── */
  function getComputers() {
    const raw = localStorage.getItem(KEYS.COMPUTERS);
    if (!raw) {
      // Seed 60 default computers
      const defaults = [];
      for (let i = 1; i <= 60; i++) {
        const code = `LAB-PC-${String(i).padStart(2,'0')}`;
        defaults.push({
          id:        code,
          code:      code,
          name:      code,
          ip:        `192.168.1.${100 + i}`,
          location:  `Row ${String.fromCharCode(64 + Math.ceil(i / 10))}, Position ${((i-1)%10)+1}`,
          row:       String.fromCharCode(64 + Math.ceil(i / 10)),
          // Simulate connectivity: 90% online, 10% offline
          isOnline:  Math.random() > 0.1,
          lastSeen:  new Date(Date.now() - Math.floor(Math.random() * 10) * 60000).toISOString(),
          createdAt: new Date().toISOString(),
        });
      }
      localStorage.setItem(KEYS.COMPUTERS, JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(raw);
  }

  function saveComputers(computers) {
    localStorage.setItem(KEYS.COMPUTERS, JSON.stringify(computers));
  }

  function getComputerById(id) {
    return getComputers().find(c => c.id === id) || null;
  }

  /** Get computer with derived status fields */
  function getComputerWithStatus(id) {
    const c = getComputerById(id);
    if (!c) return null;
    const { status, record } = getComputerAvailability(id);
    return { ...c, availStatus: status, currentRecord: record };
  }

  /** All computers with derived status */
  function getAllComputersWithStatus() {
    return getComputers().map(c => {
      const { status, record } = getComputerAvailability(c.id);
      return { ...c, availStatus: status, currentRecord: record };
    });
  }

  function addComputer(data) {
    const computers = getComputers();
    const id = (data.code || data.id).toUpperCase().trim();
    if (computers.find(c => c.id === id)) throw new Error(`Computer "${id}" already exists.`);
    computers.push({
      id, code: id, name: data.name || id,
      ip: data.ip || '',
      location: data.location || 'Main Lab',
      row: data.row || 'A',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    saveComputers(computers);
    return id;
  }

  function updateComputer(id, patch) {
    const computers = getComputers();
    const idx = computers.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Computer "${id}" not found.`);
    computers[idx] = { ...computers[idx], ...patch };
    saveComputers(computers);
  }

  function removeComputer(id) {
    saveComputers(getComputers().filter(c => c.id !== id));
  }

  /** Simulate heartbeat: randomly flip some online statuses */
  function simulateHeartbeats() {
    const computers = getComputers();
    computers.forEach(c => {
      // 5% chance of status flip per call, keeps simulation realistic
      if (Math.random() < 0.05) {
        c.isOnline = !c.isOnline;
        c.lastSeen = c.isOnline ? new Date().toISOString() : c.lastSeen;
      }
    });
    saveComputers(computers);
  }

  /* ───────────────────────────────────────────────────────────────
     Usage Records
  ─────────────────────────────────────────────────────────────── */
  function getRecords() {
    const raw = localStorage.getItem(KEYS.RECORDS);
    if (!raw) {
      // Seed realistic demo data
      return seedDemoRecords();
    }
    return JSON.parse(raw);
  }

  function saveRecords(records) {
    localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
  }

  function getRecordById(id) {
    return getRecords().find(r => r.id === id) || null;
  }

  /**
   * Check for time overlap on a computer for a given date.
   * Returns conflicting record or null.
   * Overlap: startA < endB && startB < endA
   */
  function findOverlap(computerId, date, startTime, endTime, excludeId = null) {
    const startMin = timeToMinutes(startTime);
    const endMin   = timeToMinutes(endTime);
    return getRecords().find(r =>
      r.computerId === computerId &&
      r.date === date &&
      r.id !== excludeId &&
      timeToMinutes(r.startTime) < endMin &&
      startMin < timeToMinutes(r.endTime)
    ) || null;
  }

  /** Submit a new usage record */
  function submitRecord(data) {
    // Validate
    if (!data.studentName || !data.registerNo || !data.department || !data.year) {
      throw new Error('All student fields are required.');
    }
    if (!data.computerId || !data.startTime || !data.endTime) {
      throw new Error('Computer and time fields are required.');
    }
    if (timeToMinutes(data.endTime) <= timeToMinutes(data.startTime)) {
      throw new Error('End time must be later than start time.');
    }

    const computer = getComputerById(data.computerId);
    if (!computer) throw new Error(`Computer "${data.computerId}" not found.`);
    if (!computer.isOnline) throw new Error('This computer is currently offline.');

    const date = data.date || todayISO();
    const conflict = findOverlap(data.computerId, date, data.startTime, data.endTime);
    if (conflict) {
      const err = new Error('TIME_CONFLICT');
      err.conflict = conflict;
      throw err;
    }

    const record = {
      id:            uid(),
      computerId:    data.computerId,
      computerCode:  computer.code,
      studentName:   data.studentName.trim(),
      registerNo:    data.registerNo.trim().toUpperCase(),
      department:    data.department,
      year:          data.year,
      date,
      startTime:     data.startTime,
      endTime:       data.endTime,
      duration:      calcDuration(data.startTime, data.endTime),
      durationMin:   durationMinutes(data.startTime, data.endTime),
      submittedAt:   new Date().toISOString(),
      editedAt:      null,
      editedBy:      null,
    };

    const records = getRecords();
    records.push(record);
    saveRecords(records);

    // Ensure student exists
    upsertStudent({
      registerNo:  record.registerNo,
      name:        record.studentName,
      department:  record.department,
      year:        record.year,
    });

    // Add notification
    addNotif({
      type: 'info',
      title: 'New usage record submitted',
      message: `${record.studentName} (${record.registerNo}) — ${record.computerCode} ${formatHHMM(record.startTime)}–${formatHHMM(record.endTime)}`,
    });

    return record;
  }

  function updateRecord(id, patch, adminName = 'Admin') {
    const records = getRecords();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Record not found.');

    const old = records[idx];
    const startTime = patch.startTime || old.startTime;
    const endTime   = patch.endTime   || old.endTime;
    const date      = patch.date      || old.date;
    const computerId = patch.computerId || old.computerId;

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      throw new Error('End time must be later than start time.');
    }
    const conflict = findOverlap(computerId, date, startTime, endTime, id);
    if (conflict) {
      const err = new Error('TIME_CONFLICT');
      err.conflict = conflict;
      throw err;
    }

    records[idx] = {
      ...old, ...patch,
      startTime, endTime, date, computerId,
      duration:    calcDuration(startTime, endTime),
      durationMin: durationMinutes(startTime, endTime),
      editedAt:    new Date().toISOString(),
      editedBy:    adminName,
    };
    saveRecords(records);
    addAuditLog(adminName, 'EDIT_RECORD', `Updated usage record ${id} for ${records[idx].computerCode}`);
    return records[idx];
  }

  function deleteRecord(id, adminName = 'Admin') {
    const record = getRecordById(id);
    saveRecords(getRecords().filter(r => r.id !== id));
    addAuditLog(adminName, 'DELETE_RECORD', `Deleted usage record ${id} — ${record?.computerCode} ${record?.date}`);
  }

  /* ───────────────────────────────────────────────────────────────
     Students
  ─────────────────────────────────────────────────────────────── */
  function getStudents() {
    const raw = localStorage.getItem(KEYS.STUDENTS);
    return raw ? JSON.parse(raw) : [];
  }

  function saveStudents(students) {
    localStorage.setItem(KEYS.STUDENTS, JSON.stringify(students));
  }

  function upsertStudent(data) {
    const students = getStudents();
    const idx = students.findIndex(s => s.registerNo === data.registerNo);
    if (idx === -1) {
      students.push({
        id:         uid(),
        registerNo: data.registerNo,
        name:       data.name,
        department: data.department,
        year:       data.year,
        createdAt:  new Date().toISOString(),
      });
    } else {
      // Update name/dept/year if changed
      students[idx] = { ...students[idx], ...data };
    }
    saveStudents(students);
  }

  function getStudentWithStats(registerNo) {
    const students = getStudents();
    const student  = students.find(s => s.registerNo === registerNo);
    if (!student) return null;
    const records  = getRecords().filter(r => r.registerNo === registerNo);
    const totalMin = records.reduce((sum, r) => sum + (r.durationMin || 0), 0);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return {
      ...student,
      totalRecords:  records.length,
      totalUsage:    h > 0 ? `${h}h ${m}m` : `${m}m`,
      avgDuration:   records.length ? Math.round(totalMin / records.length) : 0,
      lastSeen:      records.length ? records[records.length - 1].date : null,
    };
  }

  /* ───────────────────────────────────────────────────────────────
     Filters / Queries
  ─────────────────────────────────────────────────────────────── */
  function filterRecords({ search, dateFrom, dateTo, department, year, computerId, registerNo } = {}) {
    let records = getRecords();

    if (search) {
      const q = search.toLowerCase();
      records = records.filter(r =>
        r.studentName.toLowerCase().includes(q) ||
        r.registerNo.toLowerCase().includes(q) ||
        r.computerCode.toLowerCase().includes(q)
      );
    }
    if (dateFrom) records = records.filter(r => r.date >= dateFrom);
    if (dateTo)   records = records.filter(r => r.date <= dateTo);
    if (department && department !== 'all') records = records.filter(r => r.department === department);
    if (year && year !== 'all') records = records.filter(r => r.year === year);
    if (computerId && computerId !== 'all') records = records.filter(r => r.computerId === computerId);
    if (registerNo) records = records.filter(r => r.registerNo.includes(registerNo.toUpperCase()));

    // Sort newest first
    return records.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.startTime.localeCompare(a.startTime);
    });
  }

  /* ───────────────────────────────────────────────────────────────
     Statistics
  ─────────────────────────────────────────────────────────────── */
  function getStats() {
    const computers = getAllComputersWithStatus();
    const records   = getRecords();
    const today     = todayISO();
    const todayRecs = records.filter(r => r.date === today);

    return {
      total:       computers.length,
      available:   computers.filter(c => c.isOnline && c.availStatus === 'AVAILABLE').length,
      inUse:       computers.filter(c => c.availStatus === 'IN_USE').length,
      offline:     computers.filter(c => !c.isOnline).length,
      todayRecords: todayRecs.length,
      totalRecords: records.length,
      totalStudents: getStudents().length,
    };
  }

  /* ───────────────────────────────────────────────────────────────
     Analytics
  ─────────────────────────────────────────────────────────────── */
  function getAnalytics(days = 30) {
    const records = getRecords();
    const today   = todayISO();

    // Daily usage counts (last N days)
    const dailyCounts = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyCounts[d] = 0;
    }
    records.forEach(r => { if (dailyCounts[r.date] !== undefined) dailyCounts[r.date]++; });

    // Department breakdown
    const deptMap = {};
    records.forEach(r => { deptMap[r.department] = (deptMap[r.department] || 0) + 1; });

    // Peak hours
    const hourMap = {};
    for (let h = 8; h <= 17; h++) hourMap[h] = 0;
    records.forEach(r => {
      const startH = parseInt(r.startTime.split(':')[0]);
      const endH   = parseInt(r.endTime.split(':')[0]);
      for (let h = startH; h < endH; h++) {
        if (hourMap[h] !== undefined) hourMap[h]++;
      }
    });

    // Computer utilization (top 10)
    const compMap = {};
    records.forEach(r => {
      compMap[r.computerCode] = (compMap[r.computerCode] || 0) + (r.durationMin || 0);
    });
    const topComputers = Object.entries(compMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, min]) => ({ code, minutes: min }));

    // Average duration
    const totalMin = records.reduce((s, r) => s + (r.durationMin || 0), 0);
    const avgMin   = records.length ? Math.round(totalMin / records.length) : 0;
    const avgH = Math.floor(avgMin / 60), avgM = avgMin % 60;

    return {
      dailyCounts,
      deptBreakdown: deptMap,
      peakHours: hourMap,
      topComputers,
      avgDuration: avgH > 0 ? `${avgH}h ${avgM}m` : `${avgM}m`,
      mostUsed: topComputers[0]?.code || '—',
    };
  }

  /* ───────────────────────────────────────────────────────────────
     Audit Log
  ─────────────────────────────────────────────────────────────── */
  function getAuditLog() {
    const raw = localStorage.getItem(KEYS.AUDIT);
    return raw ? JSON.parse(raw) : [];
  }

  function addAuditLog(admin, action, description) {
    const logs = getAuditLog();
    logs.unshift({
      id:          uid(),
      timestamp:   new Date().toISOString(),
      admin,
      action,
      description,
      ip:          '192.168.1.' + Math.floor(Math.random() * 20 + 1),
    });
    // Keep last 500
    if (logs.length > 500) logs.splice(500);
    localStorage.setItem(KEYS.AUDIT, JSON.stringify(logs));
  }

  /* ───────────────────────────────────────────────────────────────
     Notifications
  ─────────────────────────────────────────────────────────────── */
  function getNotifs() {
    const raw = localStorage.getItem(KEYS.NOTIFS);
    return raw ? JSON.parse(raw) : [];
  }

  function addNotif({ type = 'info', title, message }) {
    const notifs = getNotifs();
    notifs.unshift({
      id:        uid(),
      type,
      title,
      message,
      createdAt: new Date().toISOString(),
      read:      false,
    });
    if (notifs.length > 50) notifs.splice(50);
    localStorage.setItem(KEYS.NOTIFS, JSON.stringify(notifs));
  }

  function markNotifsRead() {
    const notifs = getNotifs().map(n => ({ ...n, read: true }));
    localStorage.setItem(KEYS.NOTIFS, JSON.stringify(notifs));
  }

  function getUnreadCount() {
    return getNotifs().filter(n => !n.read).length;
  }

  /* ───────────────────────────────────────────────────────────────
     Demo Seed Data
  ─────────────────────────────────────────────────────────────── */
  function seedDemoRecords() {
    const departments  = ['AI & DS', 'CSE', 'ECE', 'EEE', 'IT', 'MECH', 'CIVIL'];
    const years        = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
    const names        = ['Deepak Kumar','Priya Sharma','Arjun Mehta','Ananya Singh','Karthik Raj',
                          'Sneha Patel','Vikram Nair','Divya Krishnan','Rohit Gupta','Meena Iyer',
                          'Suresh Babu','Lakshmi Devi','Manoj Kumar','Riya Joshi','Arun Das'];
    const records = [];
    const today = todayISO();

    // Add seeded records for past 7 days
    for (let day = 0; day < 7; day++) {
      const date = new Date(Date.now() - day * 86400000).toISOString().slice(0, 10);
      const slots = [
        ['09:00','10:00'],['09:30','11:00'],['10:00','12:00'],
        ['11:00','13:00'],['13:00','15:00'],['14:00','16:00'],
        ['15:00','17:00'],['08:30','10:30'],['10:30','12:30'],
      ];
      // ~10-14 records per day across 60 computers
      const count = 10 + Math.floor(Math.random() * 5);
      const usedSlots = new Map(); // computerId => used slots

      for (let i = 0; i < count; i++) {
        const pcNum = Math.floor(Math.random() * 60) + 1;
        const pcCode = `LAB-PC-${String(pcNum).padStart(2,'0')}`;
        const slot   = slots[Math.floor(Math.random() * slots.length)];
        const key    = `${pcCode}_${slot[0]}`;
        if (usedSlots.has(key)) continue;
        usedSlots.set(key, true);

        const name = names[Math.floor(Math.random() * names.length)];
        const deptIdx = Math.floor(Math.random() * departments.length);
        const yearIdx = Math.floor(Math.random() * years.length);
        const regPfx  = ['24AD','24CS','24EC','24EE','24IT','24ME','24CV'][deptIdx];
        const regNo   = `${regPfx}${String(Math.floor(Math.random() * 60) + 1).padStart(3,'0')}`;

        records.push({
          id:           uid(),
          computerId:   pcCode,
          computerCode: pcCode,
          studentName:  name,
          registerNo:   regNo,
          department:   departments[deptIdx],
          year:         years[yearIdx],
          date,
          startTime:    slot[0],
          endTime:      slot[1],
          duration:     calcDuration(slot[0], slot[1]),
          durationMin:  durationMinutes(slot[0], slot[1]),
          submittedAt:  new Date(`${date}T${slot[0]}:00`).toISOString(),
          editedAt:     null,
          editedBy:     null,
        });
      }
    }

    localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));

    // Seed students from records
    const studentMap = {};
    records.forEach(r => {
      if (!studentMap[r.registerNo]) {
        studentMap[r.registerNo] = {
          id:         uid(),
          registerNo: r.registerNo,
          name:       r.studentName,
          department: r.department,
          year:       r.year,
          createdAt:  r.submittedAt,
        };
      }
    });
    localStorage.setItem(KEYS.STUDENTS, JSON.stringify(Object.values(studentMap)));

    return records;
  }

  /* ───────────────────────────────────────────────────────────────
     Export helpers
  ─────────────────────────────────────────────────────────────── */
  function exportCSV(records) {
    const headers = ['Date','Student','Register No','Department','Year','Computer','Start','End','Duration'];
    const rows = records.map(r => [
      r.date, r.studentName, r.registerNo, r.department, r.year,
      r.computerCode, formatHHMM(r.startTime), formatHHMM(r.endTime), r.duration
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `smartlab_records_${todayISO()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportExcel(records) {
    // Generate simple HTML table that Excel can open
    const headers = ['Date','Student','Register No','Department','Year','Computer','Start','End','Duration'];
    let html = `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>`;
    records.forEach(r => {
      html += `<tr><td>${r.date}</td><td>${r.studentName}</td><td>${r.registerNo}</td>`;
      html += `<td>${r.department}</td><td>${r.year}</td><td>${r.computerCode}</td>`;
      html += `<td>${formatHHMM(r.startTime)}</td><td>${formatHHMM(r.endTime)}</td><td>${r.duration}</td></tr>`;
    });
    html += '</tbody></table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `smartlab_records_${todayISO()}.xls`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportPDF(records) {
    const w = window.open('', '_blank');
    const settings = getSettings();
    let tableRows = records.map(r =>
      `<tr><td>${r.date}</td><td>${r.studentName}</td><td>${r.registerNo}</td>
       <td>${r.department}</td><td>${r.year}</td><td>${r.computerCode}</td>
       <td>${formatHHMM(r.startTime)}</td><td>${formatHHMM(r.endTime)}</td><td>${r.duration}</td></tr>`
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>SmartLab Monitor — Report</title>
      <style>body{font-family:Inter,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:20px;font-weight:700;margin-bottom:4px}
      p{font-size:12px;color:#64748b;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f1f5f9;padding:8px 10px;text-align:left;font-weight:700;border:1px solid #e2e8f0;text-transform:uppercase;font-size:9px;letter-spacing:.5px}
      td{padding:7px 10px;border:1px solid #e2e8f0}</style></head><body>
      <h1>SmartLab Monitor — Usage Report</h1>
      <p>${settings.labName} · ${settings.instituteName} · Generated ${new Date().toLocaleString('en-IN')}</p>
      <table><thead><tr><th>Date</th><th>Student</th><th>Reg No</th><th>Dept</th><th>Year</th><th>Computer</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  /* ───────────────────────────────────────────────────────────────
     Public API
  ─────────────────────────────────────────────────────────────── */
  return {
    /* Helpers */
    uid, todayISO, formatHHMM, formatDatePretty, currentHHMM,
    timeToMinutes, calcDuration, durationMinutes,

    /* Settings */
    getSettings, saveSettings, verifyAdmin,

    /* Computers */
    getComputers, getComputerById, getComputerWithStatus,
    getAllComputersWithStatus, getComputerAvailability,
    addComputer, updateComputer, removeComputer,
    simulateHeartbeats,

    /* Records */
    getRecords, getRecordById, filterRecords,
    submitRecord, updateRecord, deleteRecord,
    findOverlap,

    /* Students */
    getStudents, upsertStudent, getStudentWithStats,

    /* Stats & Analytics */
    getStats, getAnalytics,

    /* Audit */
    getAuditLog, addAuditLog,

    /* Notifications */
    getNotifs, addNotif, markNotifsRead, getUnreadCount,

    /* Export */
    exportCSV, exportExcel, exportPDF,
  };
})();
