const SmartLabData = (() => {
  const STORAGE_KEY = 'smartlab-monitor-state-v1';

  function notifyStateUpdated() {
    window.dispatchEvent(new CustomEvent('smartlab-state-updated'));
  }

  const defaultComputers = Array.from({ length: 60 }, (_, index) => {
    const pcNumber = index + 1;
    const status = 'AVAILABLE';
    const lastSeen = new Date(Date.now() - (index % 3) * 86400000).toISOString().slice(0, 16);

    return {
      id: `LAB-PC-${String(pcNumber).padStart(2, '0')}`,
      label: `LAB-PC-${String(pcNumber).padStart(2, '0')}`,
      status,
      studentName: '',
      lastSeen,
      department: '',
      currentBooking: null
    };
  });

  const defaultStudents = [
    { id: 1, name: 'Aisha Khan', registerNumber: '20CS101', department: 'CSE', year: '3rd Year' },
    { id: 2, name: 'Arun Kumar', registerNumber: '21AI205', department: 'AI & DS', year: '2nd Year' },
    { id: 3, name: 'Nandha S', registerNumber: '19EC118', department: 'ECE', year: '4th Year' },
    { id: 4, name: 'Farah J', registerNumber: '22EE415', department: 'EEE', year: '1st Year' },
    { id: 5, name: 'Karthik P', registerNumber: '23ME112', department: 'MECH', year: '2nd Year' }
  ];

  const defaultRecords = [
    {
      id: 'R-1001',
      studentName: 'Aisha Khan',
      registerNumber: '20CS101',
      department: 'CSE',
      year: '3rd Year',
      computerId: 'LAB-PC-01',
      bookedDate: '2026-10-14',
      startTime: '09:00',
      endTime: '11:00',
      durationHours: 2,
      status: 'IN_USE',
      createdAt: '2026-10-14T08:45:00.000Z'
    },
    {
      id: 'R-1002',
      studentName: 'Arun Kumar',
      registerNumber: '21AI205',
      department: 'AI & DS',
      year: '2nd Year',
      computerId: 'LAB-PC-08',
      bookedDate: '2026-10-14',
      startTime: '11:30',
      endTime: '13:00',
      durationHours: 1.5,
      status: 'IN_USE',
      createdAt: '2026-10-14T09:10:00.000Z'
    },
    {
      id: 'R-1003',
      studentName: 'Nandha S',
      registerNumber: '19EC118',
      department: 'ECE',
      year: '4th Year',
      computerId: 'LAB-PC-14',
      bookedDate: '2026-10-14',
      startTime: '14:00',
      endTime: '15:30',
      durationHours: 1.5,
      status: 'IN_USE',
      createdAt: '2026-10-14T10:20:00.000Z'
    }
  ];

  const defaultSchedules = [
    { id: 'SCH-101', className: 'Data Structures Lab', department: 'IT', day: 'Monday', time: '09:00', durationHours: 2, room: 'Lab A1' },
    { id: 'SCH-102', className: 'Network Security Lab', department: 'IT', day: 'Wednesday', time: '11:00', durationHours: 2, room: 'Lab B2' },
    { id: 'SCH-103', className: 'Web Development Studio', department: 'CSE', day: 'Friday', time: '14:00', durationHours: 3, room: 'Lab C3' }
  ];

  const defaultTimetables = [
    { id: 'TT-101', title: 'IT Semester Timetable', department: 'IT', day: 'Monday', time: '09:00', room: 'Room A1', fileName: 'it-schedule.pdf' },
    { id: 'TT-102', title: 'AI & ML Schedule', department: 'AI & ML', day: 'Wednesday', time: '11:00', room: 'Room B2', fileName: 'ai-ml.pdf' }
  ];

  function generateInitialState() {
    return {
      computers: JSON.parse(JSON.stringify(defaultComputers)),
      students: JSON.parse(JSON.stringify(defaultStudents)),
      records: JSON.parse(JSON.stringify(defaultRecords)),
      schedules: JSON.parse(JSON.stringify(defaultSchedules)),
      timetables: JSON.parse(JSON.stringify(defaultTimetables)),
      settings: { autoApprove: true, conflictDetection: true }
    };
  }

  /**
   * Ensures that computer array has all required fields but does NOT
   * reset status back to AVAILABLE — that was the critical bug.
   */
  function sanitizeComputers(computers) {
    if (!computers || !Array.isArray(computers) || computers.length === 0) {
      return JSON.parse(JSON.stringify(defaultComputers));
    }
    return computers.map((computer) => ({
      id: computer.id,
      label: computer.label || computer.id,
      status: computer.status || 'AVAILABLE',
      studentName: computer.studentName || '',
      department: computer.department || '',
      lastSeen: computer.lastSeen || '',
      currentBooking: computer.currentBooking || null
    }));
  }

  function readLocalState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = generateInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    try {
      const parsed = JSON.parse(raw);
      const state = {
        computers: sanitizeComputers(parsed.computers),
        students: parsed.students || JSON.parse(JSON.stringify(defaultStudents)),
        records: parsed.records || JSON.parse(JSON.stringify(defaultRecords)),
        schedules: parsed.schedules || JSON.parse(JSON.stringify(defaultSchedules)),
        timetables: parsed.timetables || JSON.parse(JSON.stringify(defaultTimetables)),
        settings: {
          autoApprove: true,
          conflictDetection: true,
          ...(parsed.settings || {})
        }
      };
      return state;
    } catch (error) {
      const initial = generateInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
  }

  function saveState(state) {
    const stateToSave = {
      ...state,
      computers: sanitizeComputers(state.computers)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    notifyStateUpdated();
  }

  function ensureLiveRefresh(intervalMs = 8000) {
    if (window.__smartlabLiveRefreshInterval) {
      return;
    }

    window.__smartlabLiveRefreshInterval = setInterval(async () => {
      try {
        const payload = await fetchJson('/api/state');
        if (payload && payload.computers) {
          saveState(payload);
        }
      } catch (error) {
        // Ignore refresh failures and keep the app responsive.
      }
    }, intervalMs);
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Request failed');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    return response.json();
  }

  async function loadState() {
    try {
      const payload = await fetchJson('/api/state');
      if (payload && payload.computers) {
        saveState(payload);
        return payload;
      }
    } catch (error) {
      // fallback to localStorage when API is unavailable
    }

    return readLocalState();
  }

  async function getComputerStatusSummary() {
    try {
      const payload = await fetchJson('/api/summary');
      if (payload) {
        return payload;
      }
    } catch (error) {
      // fallback to local data
    }

    const state = readLocalState();
    return {
      total: state.computers.length,
      available: state.computers.filter((pc) => pc.status === 'AVAILABLE').length,
      inUse: state.computers.filter((pc) => pc.status === 'IN_USE').length,
      offline: state.computers.filter((pc) => pc.status === 'OFFLINE').length,
      maintenance: state.computers.filter((pc) => pc.status === 'MAINTENANCE').length
    };
  }

  async function getAvailableComputer() {
    const state = await loadState();
    const available = (state.computers || []).find((pc) => pc.status === 'AVAILABLE');
    return available ? available.id : null;
  }

  async function addStudent(student) {
    const state = await loadState();
    state.students.push({ id: Date.now(), ...student });
    saveState(state);
    notifyStateUpdated();
  }

  async function addComputer(payload) {
    try {
      const response = await fetchJson('/api/computers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (response && response.ok) {
        return response.computer || response;
      }
    } catch (error) {
      // fallback to localStorage update
    }

    const state = readLocalState();
    const computer = {
      id: payload.computerId,
      label: payload.computerId,
      status: payload.status || 'AVAILABLE',
      studentName: payload.studentName || '',
      department: payload.department || '',
      lastSeen: new Date().toISOString().slice(0, 16),
      currentBooking: null
    };
    state.computers.push(computer);
    saveState(state);
    return computer;
  }

  async function addUsageRecord(payload) {
    try {
      const response = await fetchJson('/api/records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (response && response.record) {
        // After API success, update local state to reflect the new booking
        const state = readLocalState();
        state.records.unshift(response.record);
        const computer = state.computers.find((pc) => pc.id === payload.computerId);
        if (computer) {
          computer.status = 'IN_USE';
          computer.studentName = payload.studentName;
          computer.department = payload.department;
          computer.lastSeen = new Date().toISOString().slice(0, 16);
          computer.currentBooking = { start: payload.startTime, end: payload.endTime };
        }
        saveState(state);
        return response.record;
      }
    } catch (error) {
      // fallback to localStorage update
    }

    const state = readLocalState();
    const record = {
      id: `R-${Date.now()}`,
      ...payload,
      durationHours: SmartLabUtils.timeDifferenceInHours(payload.startTime, payload.endTime),
      status: 'IN_USE',
      createdAt: new Date().toISOString()
    };

    state.records.unshift(record);

    const computer = state.computers.find((pc) => pc.id === payload.computerId);
    if (computer) {
      computer.status = 'IN_USE';
      computer.studentName = payload.studentName;
      computer.department = payload.department;
      computer.lastSeen = new Date().toISOString().slice(0, 16);
      computer.currentBooking = { start: payload.startTime, end: payload.endTime };
    }
    saveState(state);

    return record;
  }

  function validateNoOverlap(date, computerId, startTime, endTime) {
    const state = readLocalState();
    const sameComputer = state.records.filter((record) => record.computerId === computerId && record.bookedDate === date);
    return sameComputer.every((record) => {
      const existingStart = SmartLabUtils.parseTimeToMinutes(record.startTime);
      const existingEnd = SmartLabUtils.parseTimeToMinutes(record.endTime);
      const newStart = SmartLabUtils.parseTimeToMinutes(startTime);
      const newEnd = SmartLabUtils.parseTimeToMinutes(endTime);
      return newEnd <= existingStart || newStart >= existingEnd;
    });
  }

  async function loginAdmin(username, password) {
    try {
      const payload = await fetchJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      return payload || { ok: true, message: 'Admin login successful' };
    } catch (error) {
      if (username === 'admin' && password === 'admin123') {
        return { ok: true, message: 'Admin login successful' };
      }
      return { ok: false, message: 'Invalid username or password' };
    }
  }

  async function getMonthlyReport(month = '') {
    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    try {
      const payload = await fetchJson(`/api/reports/monthly${query}`);
      if (payload) {
        return payload;
      }
    } catch (error) {
      // fallback to local data
    }

    const state = readLocalState();
    const records = month
      ? state.records.filter((record) => record.bookedDate && record.bookedDate.startsWith(month))
      : state.records;

    const totalHours = records.reduce((sum, record) => sum + SmartLabUtils.timeDifferenceInHours(record.startTime, record.endTime), 0);
    const byDepartment = records.reduce((acc, record) => {
      acc[record.department] = (acc[record.department] || 0) + 1;
      return acc;
    }, {});

    return {
      month,
      totalRecords: records.length,
      totalHours: Number(totalHours.toFixed(2)),
      byDepartment,
      records
    };
  }

  async function addSchedule(schedule) {
    const state = await loadState();
    const normalized = {
      ...schedule,
      id: schedule.id || `SCH-${Date.now()}`,
      department: schedule.department || 'IT',
      day: schedule.day || 'Monday',
      time: schedule.time || '09:00',
      durationHours: Number(schedule.durationHours || 1),
      room: schedule.room || 'Lab A1'
    };
    state.schedules = [normalized, ...(state.schedules || [])];
    saveState(state);
    return normalized;
  }

  async function updateSchedule(scheduleId, updates) {
    const state = await loadState();
    state.schedules = (state.schedules || []).map((item) => item.id === scheduleId ? { ...item, ...updates } : item);
    saveState(state);
    return state.schedules.find((item) => item.id === scheduleId);
  }

  async function deleteSchedule(scheduleId) {
    const state = await loadState();
    state.schedules = (state.schedules || []).filter((item) => item.id !== scheduleId);
    saveState(state);
    return true;
  }

  async function upsertStudent(student) {
    const state = await loadState();
    if (student.id) {
      state.students = (state.students || []).map((item) => item.id === student.id ? { ...item, ...student } : item);
    } else {
      state.students = [{ id: Date.now(), ...student }, ...(state.students || [])];
    }
    saveState(state);
    return state.students.find((item) => item.id === (student.id || state.students[0]?.id));
  }

  async function changeAdminPassword(currentPassword, newPassword) {
    const trimmed = String(newPassword || '').trim();
    if (!trimmed || trimmed.length < 6) {
      return { ok: false, message: 'New password must be at least 6 characters.' };
    }
    const expected = sessionStorage.getItem('smartlab-admin-password') || 'admin123';
    if (String(currentPassword || '').trim() !== expected) {
      return { ok: false, message: 'Current admin password is incorrect.' };
    }
    sessionStorage.setItem('smartlab-admin-password', trimmed);
    return { ok: true, message: 'Admin password updated successfully.' };
  }

  async function addTimetable(item) {
    const state = await loadState();
    const normalized = {
      ...item,
      id: item.id || `TT-${Date.now()}`,
      title: item.title || 'Timetable',
      department: item.department || 'IT',
      day: item.day || 'Monday',
      time: item.time || '09:00',
      room: item.room || 'Room A1',
      fileName: item.fileName || 'uploaded-file.pdf'
    };
    state.timetables = [normalized, ...(state.timetables || [])];
    saveState(state);
    return normalized;
  }

  async function deleteTimetable(timetableId) {
    const state = await loadState();
    state.timetables = (state.timetables || []).filter((item) => item.id !== timetableId);
    saveState(state);
    return true;
  }

  return {
    STORAGE_KEY,
    generateInitialState,
    loadState,
    readLocalState,
    saveState,
    ensureLiveRefresh,
    getAvailableComputer,
    addStudent,
    addComputer,
    addUsageRecord,
    validateNoOverlap,
    getComputerStatusSummary,
    loginAdmin,
    getMonthlyReport,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    upsertStudent,
    changeAdminPassword,
    addTimetable,
    deleteTimetable
  };
})();
