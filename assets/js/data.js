const SmartLabData = (() => {
  const STORAGE_KEY = 'smartlab-monitor-state-v1';

  const defaultComputers = Array.from({ length: 60 }, (_, index) => {
    const pcNumber = index + 1;
    const statusPool = ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'IN_USE', 'IN_USE', 'IN_USE', 'OFFLINE'];
    const status = statusPool[index % statusPool.length];
    const lastSeen = new Date(Date.now() - (index % 3) * 86400000).toISOString().slice(0, 16);

    return {
      id: `LAB-PC-${String(pcNumber).padStart(2, '0')}`,
      label: `LAB-PC-${String(pcNumber).padStart(2, '0')}`,
      status,
      studentName: status === 'IN_USE' ? ['Aisha', 'Arun', 'Nandha', 'Farah', 'Karthik'][index % 5] : '',
      lastSeen,
      department: status === 'IN_USE' ? ['CSE', 'AI & DS', 'ECE', 'EEE', 'MECH'][index % 5] : '',
      currentBooking: status === 'IN_USE' ? { start: '09:30', end: '11:00' } : null
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

  function generateInitialState() {
    return {
      computers: defaultComputers,
      students: defaultStudents,
      records: defaultRecords,
      settings: { autoApprove: true, conflictDetection: true }
    };
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
      return {
        computers: parsed.computers || defaultComputers,
        students: parsed.students || defaultStudents,
        records: parsed.records || defaultRecords,
        settings: {
          autoApprove: true,
          conflictDetection: true,
          ...(parsed.settings || {})
        }
      };
    } catch (error) {
      const initial = generateInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    const available = state.computers.find((pc) => pc.status === 'AVAILABLE');
    return available ? available.id : null;
  }

  async function addStudent(student) {
    const state = await loadState();
    state.students.push({ id: Date.now(), ...student });
    saveState(state);
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
      status: 'IN_USE'
    };

    state.records.unshift(record);
    saveState(state);

    const computer = state.computers.find((pc) => pc.id === payload.computerId);
    if (computer) {
      computer.status = 'IN_USE';
      computer.studentName = payload.studentName;
      computer.department = payload.department;
      computer.lastSeen = new Date().toISOString().slice(0, 16);
      computer.currentBooking = { start: payload.startTime, end: payload.endTime };
      saveState(state);
    }

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

  return {
    STORAGE_KEY,
    generateInitialState,
    loadState,
    saveState,
    getAvailableComputer,
    addStudent,
    addComputer,
    addUsageRecord,
    validateNoOverlap,
    getComputerStatusSummary,
    loginAdmin,
    getMonthlyReport
  };
})();
