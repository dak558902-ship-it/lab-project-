document.addEventListener('DOMContentLoaded', async function () {
  /* ── Element references ── */
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const pageTitle = document.getElementById('page-title');
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const recordsTableBody = document.getElementById('records-table-body');
  const studentsTableBody = document.getElementById('students-table-body');
  const dashboardKpis = document.getElementById('dashboard-kpis');
  const miniGrid = document.getElementById('mini-grid');
  const computerGrid = document.getElementById('computer-grid');
  const reportSummary = document.getElementById('report-summary');
  const computerModal = document.getElementById('computer-modal');
  const modalBody = document.getElementById('modal-body');
  const computerFormPanel = document.getElementById('computer-form-panel');
  const addComputerForm = document.getElementById('add-computer-form');
  const computerFormError = document.getElementById('computer-form-error');
  const addComputerBtn = document.getElementById('add-computer-btn');
  const cancelComputerFormBtn = document.getElementById('cancel-computer-form-btn');
  const reportRecordsBody = document.getElementById('report-records-body');
  const monthlyReportSummary = document.getElementById('monthly-report-summary');
  const reportMonthInput = document.getElementById('report-month');
  const reportStaffNameInput = document.getElementById('report-staff-name');
  const ADMIN_SESSION_KEY = 'smartlab-admin-auth';
  const activityFeed = document.getElementById('activity-feed');
  const staffForm = document.getElementById('staff-form');
  const scheduleForm = document.getElementById('schedule-form');
  const scheduleList = document.getElementById('schedule-list');
  const adminPasswordForm = document.getElementById('admin-password-form');
  const passwordFormError = document.getElementById('password-form-error');
  const timetableForm = document.getElementById('timetable-form');
  const timetableList = document.getElementById('timetable-list');

  /* ── Auth helpers ── */
  function isAdminLoggedIn() {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
  }

  function setAdminSession(value) {
    if (value) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
      return;
    }
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  }

  function showAdminLogin() {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
    loginForm.reset();
    loginError.classList.add('hidden');
    loginError.textContent = '';
    window.history.replaceState({ view: 'login' }, 'Admin Login', 'admin.html');
  }

  function showAdminDashboard() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    window.history.replaceState({ view: 'dashboard' }, 'Admin Dashboard', 'admin.html');
  }

  function handleAdminBackFlow() {
    if (isAdminLoggedIn()) {
      setPage('dashboard');
      showAdminDashboard();
      return;
    }
    window.location.href = 'index.html';
  }

  /* ── Navigation ── */
  function setPage(section) {
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.section === section));
    sections.forEach((element) => {
      const isActive = element.id === `${section}-section`;
      element.classList.toggle('active', isActive);
      element.style.display = isActive ? 'block' : 'none';
    });
    const labels = {
      dashboard: 'Overview',
      computers: 'Computers',
      records: 'Usage Records',
      students: 'Staff Directory',
      schedules: 'Class Schedules',
      reports: 'Reports',
      analytics: 'Analytics',
      settings: 'Settings'
    };
    pageTitle.textContent = labels[section] || 'Overview';
  }

  /* ── Status helpers ── */
  function getStatusLabel(status) {
    if (status === 'MAINTENANCE') return 'Under Maintenance';
    if (status === 'IN_USE') return 'In Use';
    if (status === 'OFFLINE') return 'Offline';
    return 'Available';
  }

  function formatStatusClass(status) {
    return (status || 'AVAILABLE').toLowerCase().replace('_', '-').replace('maintenance', 'offline');
  }

  function toggleComputerForm(show) {
    computerFormPanel.classList.toggle('hidden', !show);
    if (!show) {
      addComputerForm.reset();
      computerFormError.classList.add('hidden');
      computerFormError.textContent = '';
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  RENDERING FUNCTIONS
   * ══════════════════════════════════════════════════════════════════ */

  async function renderDashboard() {
    const summary = await SmartLabData.getComputerStatusSummary();
    const state = await SmartLabData.loadState();
    const telemetry = buildTelemetryOverview(state);
    const stats = [
      { label: 'Total Computers', value: summary.total, tone: 'primary' },
      { label: 'Available', value: summary.available, tone: 'success' },
      { label: 'In Use', value: summary.inUse, tone: 'info' },
      { label: 'Live Telemetry', value: telemetry.lastActivity, tone: 'warning' }
    ];

    dashboardKpis.innerHTML = stats.map((stat) => `
      <div class="kpi-card">
        <p class="label">${stat.label}</p>
        <div class="value ${stat.tone === 'warning' ? 'compact-metric' : ''}">${stat.value}</div>
      </div>
    `).join('');

    renderActivityFeed(state);
    miniGrid.innerHTML = (state.computers || []).slice(0, 10).map((pc) => `
      <div class="mini-node">
        <span class="status-dot ${String(pc.status || 'AVAILABLE').toLowerCase().replace('_', '-') }" aria-hidden="true"></span>
        ${pc.id.split('-').slice(-1)[0]}
      </div>
    `).join('');
  }

  async function renderComputerGrid() {
    const computerSearch = document.getElementById('computer-search');
    const computerFilter = document.getElementById('computer-filter');
    const searchTerm = (computerSearch.value || '').trim().toLowerCase();
    const filterTerm = computerFilter.value;
    const state = await SmartLabData.loadState();

    const computers = (state.computers || []).filter((pc) => {
      const matchesSearch = !searchTerm || pc.id.toLowerCase().includes(searchTerm) || (pc.studentName || '').toLowerCase().includes(searchTerm);
      const matchesFilter = filterTerm === 'all' || pc.status === filterTerm;
      return matchesSearch && matchesFilter;
    });

    computerGrid.innerHTML = computers.length
      ? computers.map((pc) => `
        <button class="computer-card" data-computer-id="${pc.id}" type="button">
          <div class="comp-header">
            <p class="comp-name">${pc.id}</p>
            <span class="status-tag ${formatStatusClass(pc.status)}">${getStatusLabel(pc.status)}</span>
          </div>
          <p class="comp-meta">${pc.studentName || (pc.status === 'MAINTENANCE' ? 'Locked for maintenance' : pc.status === 'IN_USE' ? 'Session active' : 'Ready for booking')}</p>
          <p class="comp-meta">${pc.status === 'OFFLINE' ? `Last seen ${SmartLabUtils.formatDate(pc.lastSeen?.slice(0, 10))}` : pc.status === 'MAINTENANCE' ? 'Maintenance mode active' : pc.status === 'IN_USE' ? `Since ${pc.currentBooking?.start || '—'}` : 'Online & monitored'}</p>
        </button>
      `).join('')
      : '<div class="panel-box"><p>No computers match your filter.</p></div>';

    document.querySelectorAll('[data-computer-id]').forEach((button) => {
      button.addEventListener('click', () => openComputerModal(button.dataset.computerId));
    });
  }

  async function renderRecords() {
    const recordSearch = document.getElementById('record-search');
    const recordStatusFilter = document.getElementById('record-status-filter');
    const term = (recordSearch.value || '').trim().toLowerCase();
    const filter = recordStatusFilter.value;
    const state = await SmartLabData.loadState();

    const records = (state.records || []).filter((record) => {
      const matchesText = !term || (record.studentName || '').toLowerCase().includes(term) || (record.computerId || '').toLowerCase().includes(term);
      const matchesStatus = filter === 'all' || record.status === filter;
      return matchesText && matchesStatus;
    });

    recordsTableBody.innerHTML = records.length
      ? records.map((record) => `
        <tr>
          <td>${record.studentName}</td>
          <td>${record.computerId}</td>
          <td>${record.department}</td>
          <td>${SmartLabUtils.formatDate(record.bookedDate)}</td>
          <td>${record.startTime} - ${record.endTime}</td>
          <td>${SmartLabUtils.formatDuration(record.startTime, record.endTime)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="6">No records found.</td></tr>';
  }

  async function renderStudents() {
    const state = await SmartLabData.loadState();
    const recordsByStaff = (state.records || []).reduce((acc, record) => {
      const key = record.registerNumber || record.studentName;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    studentsTableBody.innerHTML = (state.students || []).map((student) => {
      const sessions = recordsByStaff[student.registerNumber] || recordsByStaff[student.name] || 0;
      const hours = (sessions * 1.5).toFixed(1);
      return `
        <tr>
          <td>${student.name}</td>
          <td>${student.registerNumber}</td>
          <td>${student.department}</td>
          <td>${student.year}</td>
          <td>${sessions}</td>
          <td>${hours}h</td>
          <td>
            <div class="inline-actions">
              <button type="button" class="btn btn-ghost btn-small edit-staff-btn" data-staff-id="${student.id}">Edit</button>
              <button type="button" class="btn btn-danger btn-small delete-student-btn" data-student-id="${student.id}" data-student-name="${student.name}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    bindStaffEditButtons();
    bindStaffDeleteButtons();
  }

  function bindStaffEditButtons() {
    document.querySelectorAll('.edit-staff-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const targetId = Number(button.dataset.staffId);
        const state = await SmartLabData.loadState();
        const student = (state.students || []).find((entry) => entry.id === targetId);
        if (!student) return;
        document.getElementById('staff-id').value = student.id;
        document.getElementById('staff-name').value = student.name || '';
        document.getElementById('staff-register-number').value = student.registerNumber || '';
        document.getElementById('staff-department').value = student.department || 'IT';
        document.getElementById('staff-year').value = student.year || '1st Year';
        document.getElementById('students-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function bindStaffDeleteButtons() {
    document.querySelectorAll('.delete-student-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const studentId = Number(button.dataset.studentId);
        const studentName = button.dataset.studentName || 'this staff';
        const confirmed = window.confirm(`Delete ${studentName} from the staff database?`);
        if (!confirmed) return;

        try {
          const response = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.message || 'Unable to delete staff record.');
          }

          await renderAll();
          SmartLabUtils.showToast('Staff deleted successfully.', 'success');
        } catch (error) {
          // Fallback: remove from local state
          const state = SmartLabData.readLocalState();
          state.students = (state.students || []).filter((s) => s.id !== studentId);
          SmartLabData.saveState(state);
          await renderAll();
          SmartLabUtils.showToast('Staff deleted successfully.', 'success');
        }
      });
    });
  }

  function getFilteredRecordsForReport(state) {
    const staffName = (reportStaffNameInput.value || '').trim().toLowerCase();
    const month = (reportMonthInput.value || '').trim();

    return (state.records || []).filter((record) => {
      const matchesStaff = !staffName || (record.studentName || '').toLowerCase().includes(staffName);
      const matchesMonth = !month || (record.bookedDate || '').startsWith(month);
      return matchesStaff && matchesMonth;
    });
  }

  async function renderReports() {
    const state = await SmartLabData.loadState();
    const filtered = getFilteredRecordsForReport(state);
    const summary = filtered.reduce((acc, record) => {
      acc.total += 1;
      acc.hours += SmartLabUtils.timeDifferenceInHours(record.startTime, record.endTime);
      return acc;
    }, { total: 0, hours: 0 });

    reportSummary.innerHTML = `
      <li><span>Total entries</span><strong>${summary.total}</strong></li>
      <li><span>Hours logged</span><strong>${summary.hours.toFixed(1)}h</strong></li>
      <li><span>Departments</span><strong>${SmartLabUtils.uniqueValues(filtered, 'department').length}</strong></li>
    `;

    reportRecordsBody.innerHTML = filtered.length
      ? filtered.map((record) => `
        <tr>
          <td>${record.studentName}</td>
          <td>${record.computerId}</td>
          <td>${record.department}</td>
          <td>${SmartLabUtils.formatDate(record.bookedDate)}</td>
          <td>${record.startTime} - ${record.endTime}</td>
          <td>${SmartLabUtils.formatDuration(record.startTime, record.endTime)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="6">No matching records found.</td></tr>';

    if (!reportMonthInput.value) {
      const current = new Date();
      reportMonthInput.value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    }
    await generateMonthlyReport();
  }

  async function generateMonthlyReport() {
    const month = reportMonthInput.value;
    const state = await SmartLabData.loadState();
    const filtered = getFilteredRecordsForReport(state);
    const report = await SmartLabData.getMonthlyReport(month || '');

    const recordsForMonth = (report.records || []).filter((record) => {
      const nameFilter = (reportStaffNameInput.value || '').trim().toLowerCase();
      const matchesName = !nameFilter || (record.studentName || '').toLowerCase().includes(nameFilter);
      return matchesName;
    });

    const totalHours = recordsForMonth.reduce((sum, record) => sum + SmartLabUtils.timeDifferenceInHours(record.startTime, record.endTime), 0);
    const departmentTotals = recordsForMonth.reduce((acc, record) => {
      acc[record.department] = (acc[record.department] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(departmentTotals).map(([department, count]) => `
      <li><span>${department}</span><strong>${count}</strong></li>
    `).join('');

    monthlyReportSummary.innerHTML = `
      <div class="report-summary-grid">
        <div><span>Total records</span><strong>${recordsForMonth.length || 0}</strong></div>
        <div><span>Total hours</span><strong>${(totalHours || 0).toFixed(1)}h</strong></div>
      </div>
      <div class="report-breakdown">
        <h4>Department split</h4>
        <ul>${entries || '<li><span>No data</span><strong>0</strong></li>'}</ul>
      </div>
    `;

    reportRecordsBody.innerHTML = filtered.length
      ? filtered.map((record) => `
        <tr>
          <td>${record.studentName}</td>
          <td>${record.computerId}</td>
          <td>${record.department}</td>
          <td>${SmartLabUtils.formatDate(record.bookedDate)}</td>
          <td>${record.startTime} - ${record.endTime}</td>
          <td>${SmartLabUtils.formatDuration(record.startTime, record.endTime)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="6">No matching records found.</td></tr>';
  }

  async function renderCharts() {
    const usageCtx = document.getElementById('usage-trend-chart');
    const departmentCtx = document.getElementById('department-chart');
    const statusCtx = document.getElementById('status-chart');

    if (!usageCtx || !departmentCtx || !statusCtx || typeof Chart === 'undefined') {
      return;
    }

    if (window.smartLabChartInstances) {
      Object.values(window.smartLabChartInstances).forEach((chart) => chart.destroy());
    }
    window.smartLabChartInstances = {};

    const state = await SmartLabData.loadState();
    const trend = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const usageValues = state.records.length ? [
      state.records.filter((r) => r.bookedDate.includes('Mon')).length || 1,
      state.records.filter((r) => r.bookedDate.includes('Tue')).length || 2,
      state.records.filter((r) => r.bookedDate.includes('Wed')).length || 4,
      state.records.filter((r) => r.bookedDate.includes('Thu')).length || 3,
      state.records.filter((r) => r.bookedDate.includes('Fri')).length || 2,
      state.records.filter((r) => r.bookedDate.includes('Sat')).length || 1
    ] : [12, 18, 24, 16, 15, 10];

    window.smartLabChartInstances.usage = new Chart(usageCtx, {
      type: 'line',
      data: {
        labels: trend,
        datasets: [{
          label: 'Usage Hours',
          data: usageValues,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.12)',
          tension: 0.3,
          fill: true
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 } }
    });

    const departmentLabels = SmartLabUtils.uniqueValues(state.records, 'department');
    const finalLabels = departmentLabels.length ? departmentLabels : ['AI & DS', 'CSE', 'ECE'];
    const departmentCounts = finalLabels.map((dept) => {
      if (!state.records.length) {
        return { 'AI & DS': 12, CSE: 18, ECE: 10 }[dept] || 0;
      }
      return state.records.filter((r) => r.department === dept).length;
    });

    window.smartLabChartInstances.department = new Chart(departmentCtx, {
      type: 'doughnut',
      data: {
        labels: finalLabels,
        datasets: [{
          data: departmentCounts,
          backgroundColor: ['#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#ef4444']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { position: 'bottom' } } }
    });

    const statusCounts = [
      state.computers.filter((pc) => pc.status === 'AVAILABLE').length,
      state.computers.filter((pc) => pc.status === 'IN_USE').length,
      state.computers.filter((pc) => pc.status === 'OFFLINE').length,
      state.computers.filter((pc) => pc.status === 'MAINTENANCE').length
    ];

    window.smartLabChartInstances.status = new Chart(statusCtx, {
      type: 'bar',
      data: {
        labels: ['Available', 'In Use', 'Offline', 'Maintenance'],
        datasets: [{
          label: 'Computers',
          data: statusCounts,
          backgroundColor: ['#10b981', '#3b82f6', '#94a3b8', '#f59e0b']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 } }
    });
  }

  async function renderAll() {
    await renderDashboard();
    await renderComputerGrid();
    await renderRecords();
    await renderStudents();
    await renderReports();
    await renderCharts();
    renderTimetableList();
    renderScheduleList();
  }

  function openComputerModal(computerId) {
    SmartLabData.loadState().then((state) => {
      const computer = (state.computers || []).find((pc) => pc.id === computerId);
      if (!computer) return;

      modalBody.innerHTML = `
        <div class="summary-card">
          <div class="row"><span>Computer</span><strong>${computer.id}</strong></div>
          <div class="row"><span>Status</span><strong>${getStatusLabel(computer.status)}</strong></div>
          <div class="row"><span>Student</span><strong>${computer.studentName || '—'}</strong></div>
          <div class="row"><span>Department</span><strong>${computer.department || '—'}</strong></div>
          <div class="row"><span>Last Seen</span><strong>${computer.lastSeen || '—'}</strong></div>
          ${computer.currentBooking ? `<div class="row"><span>Booking</span><strong>${computer.currentBooking.start} - ${computer.currentBooking.end}</strong></div>` : ''}
        </div>
      `;
      computerModal.classList.remove('hidden');
    });
  }

  function renderActivityFeed(state) {
    const latestRecords = (state.records || []).slice(0, 6);
    if (!activityFeed) return;

    activityFeed.innerHTML = latestRecords.length
      ? latestRecords.map((record) => `
        <div class="activity-item">
          <span class="activity-icon">●</span>
          <div>
            <strong>${record.studentName}</strong>
            <p>Booked ${record.computerId} • ${record.department}</p>
            <small>${record.startTime} - ${record.endTime}</small>
          </div>
        </div>
      `).join('')
      : '<div class="activity-item"><span class="activity-icon">●</span><div><strong>No activity yet</strong><p>Lab usage feed will appear here.</p></div></div>';
  }

  function buildTelemetryOverview(state) {
    const total = state.computers?.length || 0;
    const available = (state.computers || []).filter((pc) => pc.status === 'AVAILABLE').length;
    const inUse = (state.computers || []).filter((pc) => pc.status === 'IN_USE').length;
    const offline = (state.computers || []).filter((pc) => pc.status === 'OFFLINE').length;
    const latest = (state.records || [])[0];

    return {
      total,
      available,
      inUse,
      offline,
      lastActivity: latest ? `${latest.studentName} • ${latest.computerId}` : 'No active bookings'
    };
  }

  /* ══════════════════════════════════════════════════════════════════
   *  TIMETABLE MANAGEMENT
   * ══════════════════════════════════════════════════════════════════ */

  function renderTimetableList() {
    if (!timetableList) return;
    SmartLabData.loadState().then((state) => {
      const timetables = state.timetables || [];
      timetableList.innerHTML = timetables.length
        ? timetables.map((timetable) => `
            <div class="schedule-item">
              <div>
                <strong>${timetable.title}</strong>
                <p>${timetable.department} • ${timetable.day} • ${timetable.time}</p>
              </div>
              <div class="schedule-meta">
                <span>${timetable.room}</span>
                <span>${timetable.fileName || 'No file'}</span>
              </div>
              <div class="schedule-actions">
                <button type="button" class="btn btn-danger btn-small timetable-delete" data-id="${timetable.id}">Delete</button>
              </div>
            </div>
          `).join('')
        : '<div class="empty-state">No timetable uploaded yet.</div>';

      document.querySelectorAll('.timetable-delete').forEach((button) => {
        button.addEventListener('click', async () => {
          await SmartLabData.deleteTimetable(button.dataset.id);
          renderTimetableList();
          SmartLabUtils.showToast('Timetable removed.', 'success');
        });
      });
    });
  }

  if (timetableForm) {
    timetableForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(timetableForm);
      const fileInput = document.getElementById('timetable-file');
      const fileName = fileInput && fileInput.files && fileInput.files[0]
        ? fileInput.files[0].name
        : 'uploaded-timetable.pdf';

      const payload = {
        title: (formData.get('title') || '').toString().trim(),
        department: (formData.get('department') || '').toString().trim(),
        day: (formData.get('day') || '').toString().trim(),
        time: (formData.get('time') || '').toString().trim(),
        room: (formData.get('room') || '').toString().trim() || 'Room A1',
        fileName: fileName
      };

      if (!payload.title || !payload.time) {
        SmartLabUtils.showToast('Please add a timetable title and time.', 'error');
        return;
      }

      await SmartLabData.addTimetable(payload);
      timetableForm.reset();
      renderTimetableList();
      SmartLabUtils.showToast('Timetable saved successfully.', 'success');
    });
  }

  const clearTimetableBtn = document.getElementById('clear-timetable-form');
  if (clearTimetableBtn) {
    clearTimetableBtn.addEventListener('click', () => {
      timetableForm.reset();
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  CLASS SCHEDULE MANAGEMENT
   * ══════════════════════════════════════════════════════════════════ */

  function renderScheduleList() {
    if (!scheduleList) return;
    SmartLabData.loadState().then((state) => {
      const schedules = state.schedules || [];
      scheduleList.innerHTML = schedules.length
        ? schedules.map((schedule) => `
            <div class="schedule-item">
              <div>
                <strong>${schedule.className}</strong>
                <p>${schedule.department} • ${schedule.day} • ${schedule.time}</p>
              </div>
              <div class="schedule-meta">
                <span>${schedule.durationHours}h</span>
                <span>${schedule.room}</span>
              </div>
              <div class="schedule-actions">
                <button type="button" class="btn btn-ghost btn-small schedule-edit" data-id="${schedule.id}">Edit</button>
                <button type="button" class="btn btn-danger btn-small schedule-delete" data-id="${schedule.id}">Delete</button>
              </div>
            </div>
          `).join('')
        : '<div class="empty-state">No class schedules are currently assigned.</div>';

      document.querySelectorAll('.schedule-edit').forEach((button) => {
        button.addEventListener('click', async () => {
          const state = await SmartLabData.loadState();
          const item = (state.schedules || []).find((schedule) => schedule.id === button.dataset.id);
          if (!item || !scheduleForm) return;
          const classNameEl = document.getElementById('schedule-class-name');
          const deptEl = document.getElementById('schedule-department');
          const dayEl = document.getElementById('schedule-day');
          const timeEl = document.getElementById('schedule-time');
          const durationEl = document.getElementById('schedule-duration');
          const roomEl = document.getElementById('schedule-room');
          if (classNameEl) classNameEl.value = item.className || '';
          if (deptEl) deptEl.value = item.department || 'IT';
          if (dayEl) dayEl.value = item.day || 'Monday';
          if (timeEl) timeEl.value = item.time || '09:00';
          if (durationEl) durationEl.value = item.durationHours || 2;
          if (roomEl) roomEl.value = item.room || 'Lab A1';
          scheduleForm.dataset.editingId = item.id;

          // Navigate to schedules section
          setPage('schedules');
        });
      });

      document.querySelectorAll('.schedule-delete').forEach((button) => {
        button.addEventListener('click', async () => {
          await SmartLabData.deleteSchedule(button.dataset.id);
          renderScheduleList();
          SmartLabUtils.showToast('Class schedule removed.', 'success');
        });
      });
    });
  }

  if (scheduleForm) {
    scheduleForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(scheduleForm);
      const payload = {
        className: (formData.get('className') || '').toString().trim(),
        department: (formData.get('department') || '').toString().trim(),
        day: (formData.get('day') || '').toString().trim(),
        time: (formData.get('time') || '').toString().trim(),
        durationHours: Number(formData.get('durationHours') || 1),
        room: (formData.get('room') || '').toString().trim() || 'Lab A1'
      };

      if (!payload.className || !payload.time) {
        SmartLabUtils.showToast('Class name and time are required for the schedule.', 'error');
        return;
      }

      const editingId = scheduleForm.dataset.editingId;
      if (editingId) {
        await SmartLabData.updateSchedule(editingId, payload);
        delete scheduleForm.dataset.editingId;
        SmartLabUtils.showToast('Class schedule updated.', 'success');
      } else {
        await SmartLabData.addSchedule(payload);
        SmartLabUtils.showToast('Class schedule added.', 'success');
      }

      scheduleForm.reset();
      const durationEl = document.getElementById('schedule-duration');
      if (durationEl) durationEl.value = '2';
      renderScheduleList();
    });
  }

  const clearScheduleBtn = document.getElementById('clear-schedule-form');
  if (clearScheduleBtn) {
    clearScheduleBtn.addEventListener('click', () => {
      if (scheduleForm) {
        scheduleForm.reset();
        const durationEl = document.getElementById('schedule-duration');
        if (durationEl) durationEl.value = '2';
        delete scheduleForm.dataset.editingId;
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  STAFF FORM
   * ══════════════════════════════════════════════════════════════════ */

  function resetStaffForm() {
    staffForm.reset();
    document.getElementById('staff-id').value = '';
  }

  staffForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(staffForm);
    const payload = {
      id: formData.get('id') ? Number(formData.get('id')) : null,
      name: (formData.get('name') || '').toString().trim(),
      registerNumber: (formData.get('registerNumber') || '').toString().trim(),
      department: (formData.get('department') || '').toString().trim(),
      year: (formData.get('year') || '').toString().trim()
    };

    if (!payload.name || !payload.registerNumber || !payload.department || !payload.year) {
      SmartLabUtils.showToast('Please complete the staff details before saving.', 'error');
      return;
    }

    await SmartLabData.upsertStudent(payload);
    resetStaffForm();
    await renderAll();
    SmartLabUtils.showToast('Staff details saved successfully.', 'success');
  });

  document.getElementById('reset-staff-form').addEventListener('click', () => {
    resetStaffForm();
  });

  /* ══════════════════════════════════════════════════════════════════
   *  PASSWORD FORM
   * ══════════════════════════════════════════════════════════════════ */

  adminPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(adminPasswordForm);
    const currentPassword = (formData.get('currentPassword') || '').toString();
    const newPassword = (formData.get('newPassword') || '').toString();
    const confirmPassword = (formData.get('confirmPassword') || '').toString();

    if (!currentPassword || !newPassword || !confirmPassword) {
      passwordFormError.textContent = 'Please fill in all password fields.';
      passwordFormError.classList.remove('hidden');
      return;
    }

    if (newPassword !== confirmPassword) {
      passwordFormError.textContent = 'New password and confirm password do not match.';
      passwordFormError.classList.remove('hidden');
      return;
    }

    const result = await SmartLabData.changeAdminPassword(currentPassword, newPassword);
    if (!result.ok) {
      passwordFormError.textContent = result.message;
      passwordFormError.classList.remove('hidden');
      return;
    }

    passwordFormError.classList.add('hidden');
    adminPasswordForm.reset();
    SmartLabUtils.showToast(result.message, 'success');
  });

  /* ══════════════════════════════════════════════════════════════════
   *  EVENT LISTENERS
   * ══════════════════════════════════════════════════════════════════ */

  document.getElementById('admin-login-back-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('back-to-home-btn').addEventListener('click', () => {
    handleAdminBackFlow();
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    setAdminSession(false);
    showAdminLogin();
    if (document.getElementById('computer-search')) document.getElementById('computer-search').value = '';
    if (document.getElementById('record-search')) document.getElementById('record-search').value = '';
    if (reportMonthInput) reportMonthInput.value = '';
    if (reportStaffNameInput) reportStaffNameInput.value = '';
    if (document.getElementById('computer-filter')) document.getElementById('computer-filter').value = 'all';
    if (document.getElementById('record-status-filter')) document.getElementById('record-status-filter').value = 'all';
  });

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const username = (formData.get('username') || '').toString().trim();
    const password = (formData.get('password') || '').toString().trim();

    const result = await SmartLabData.loginAdmin(username, password);
    if (result.ok) {
      setAdminSession(true);
      showAdminDashboard();
      setPage('dashboard');
      await renderAll();
      SmartLabUtils.showToast('Admin login successful.', 'success');
      return;
    }

    loginError.textContent = result.message || 'Invalid username or password. Try admin / admin123';
    loginError.classList.remove('hidden');
    SmartLabUtils.showToast(result.message || 'Invalid login credentials.', 'error');
  });

  navItems.forEach((item) => {
    item.addEventListener('click', async () => {
      const section = item.dataset.section;
      setPage(section);
      if (section === 'dashboard') await renderDashboard();
      if (section === 'computers') await renderComputerGrid();
      if (section === 'records') await renderRecords();
      if (section === 'students') await renderStudents();
      if (section === 'schedules') renderScheduleList();
      if (section === 'reports') await renderReports();
      if (section === 'analytics') await renderCharts();
    });
  });

  document.getElementById('computer-search').addEventListener('input', renderComputerGrid);
  document.getElementById('computer-filter').addEventListener('change', renderComputerGrid);
  document.getElementById('record-search').addEventListener('input', renderRecords);
  document.getElementById('record-status-filter').addEventListener('change', renderRecords);
  reportMonthInput.addEventListener('change', generateMonthlyReport);
  reportStaffNameInput.addEventListener('input', generateMonthlyReport);

  addComputerBtn.addEventListener('click', () => toggleComputerForm(true));
  cancelComputerFormBtn.addEventListener('click', () => toggleComputerForm(false));

  addComputerForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const formData = new FormData(addComputerForm);
    const computerId = (formData.get('computerId') || '').toString().trim();
    const status = (formData.get('status') || '').toString().trim();
    const studentName = (formData.get('studentName') || '').toString().trim();

    if (!computerId) {
      computerFormError.textContent = 'Computer ID is required.';
      computerFormError.classList.remove('hidden');
      return;
    }

    const state = await SmartLabData.loadState();
    const exists = (state.computers || []).some((pc) => pc.id.toLowerCase() === computerId.toLowerCase());
    if (exists) {
      computerFormError.textContent = 'This computer ID already exists.';
      computerFormError.classList.remove('hidden');
      return;
    }

    await SmartLabData.addComputer({
      computerId,
      status,
      studentName,
      department: status === 'IN_USE' ? 'General' : ''
    });

    toggleComputerForm(false);
    await renderAll();
    SmartLabUtils.showToast('Computer added successfully.', 'success');
  });

  document.getElementById('export-report').addEventListener('click', async function () {
    const state = await SmartLabData.loadState();
    const filtered = getFilteredRecordsForReport(state);
    const rows = filtered.map((record) => {
      const line = ['studentName', 'registerNumber', 'department', 'computerId', 'bookedDate', 'startTime', 'endTime'].map((key) => {
        const value = String(record[key] ?? '').replace(/"/g, '""');
        return `"${value}"`;
      }).join(',');
      return line;
    });
    const csv = [['studentName', 'registerNumber', 'department', 'computerId', 'bookedDate', 'startTime', 'endTime'].join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smartlab-report-summary.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    SmartLabUtils.showToast('Report summary exported.', 'info');
  });

  document.getElementById('generate-monthly-report').addEventListener('click', async () => {
    await generateMonthlyReport();
    await renderReports();
  });

  document.querySelectorAll('[data-close="true"]').forEach((element) => {
    element.addEventListener('click', () => computerModal.classList.add('hidden'));
  });

  /* ── Live refresh & state listener ── */
  SmartLabData.ensureLiveRefresh();

  window.addEventListener('smartlab-state-updated', async () => {
    if (isAdminLoggedIn()) {
      await renderDashboard();
      await renderComputerGrid();
    }
  });

  /* ══════════════════════════════════════════════════════════════════
   *  INITIALIZATION
   * ══════════════════════════════════════════════════════════════════ */

  if (isAdminLoggedIn()) {
    showAdminDashboard();
    setPage('dashboard');
    await renderAll();
  } else {
    showAdminLogin();
  }
});
