document.addEventListener('DOMContentLoaded', async function () {
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
  const ADMIN_SESSION_KEY = 'smartlab-admin-auth';

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

  function getState() {
    return SmartLabData.loadState();
  }

  function setPage(section) {
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.section === section));
    sections.forEach((element) => element.classList.toggle('active', element.id === `${section}-section`));
    const labels = {
      dashboard: 'Overview',
      computers: 'Computers',
      records: 'Usage Records',
      students: 'Students',
      reports: 'Reports',
      analytics: 'Analytics',
      settings: 'Settings'
    };
    pageTitle.textContent = labels[section] || 'Overview';
  }

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

  async function renderDashboard() {
    const summary = await SmartLabData.getComputerStatusSummary();
    const stats = [
      { label: 'Total Computers', value: summary.total, tone: 'primary' },
      { label: 'Available', value: summary.available, tone: 'success' },
      { label: 'In Use', value: summary.inUse, tone: 'info' },
      { label: 'Maintenance', value: summary.maintenance || 0, tone: 'warning' }
    ];

    dashboardKpis.innerHTML = stats.map((stat) => `
      <div class="kpi-card">
        <p class="label">${stat.label}</p>
        <div class="value">${stat.value}</div>
      </div>
    `).join('');

    const state = await SmartLabData.loadState();
    miniGrid.innerHTML = state.computers.slice(0, 10).map((pc) => `
      <div class="mini-node">
        <span class="status-dot ${pc.status.toLowerCase().replace('_', '-')}" aria-hidden="true"></span>
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

    const computers = state.computers.filter((pc) => {
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
          <p class="comp-meta">${pc.studentName || (pc.status === 'MAINTENANCE' ? 'Locked for maintenance' : 'Ready for booking')}</p>
          <p class="comp-meta">${pc.status === 'OFFLINE' ? `Last seen ${SmartLabUtils.formatDate(pc.lastSeen?.slice(0, 10))}` : pc.status === 'MAINTENANCE' ? 'Maintenance mode active' : 'Online & monitored'}</p>
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

    const records = state.records.filter((record) => {
      const matchesText = !term || record.studentName.toLowerCase().includes(term) || record.computerId.toLowerCase().includes(term);
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
    const recordsByStudent = state.records.reduce((acc, record) => {
      acc[record.registerNumber] = (acc[record.registerNumber] || 0) + 1;
      return acc;
    }, {});

    studentsTableBody.innerHTML = state.students.map((student) => `
      <tr>
        <td>${student.name}</td>
        <td>${student.registerNumber}</td>
        <td>${student.department}</td>
        <td>${student.year}</td>
        <td>${recordsByStudent[student.registerNumber] || 0}</td>
        <td>${((recordsByStudent[student.registerNumber] || 0) * 1.5).toFixed(1)}h</td>
      </tr>
    `).join('');
  }

  async function renderReports() {
    const state = await SmartLabData.loadState();
    const summary = state.records.reduce((acc, record) => {
      acc.total += 1;
      acc.hours += SmartLabUtils.timeDifferenceInHours(record.startTime, record.endTime);
      return acc;
    }, { total: 0, hours: 0 });

    reportSummary.innerHTML = `
      <li><span>Total entries</span><strong>${summary.total}</strong></li>
      <li><span>Hours logged</span><strong>${summary.hours.toFixed(1)}h</strong></li>
      <li><span>Departments</span><strong>${SmartLabUtils.uniqueValues(state.records, 'department').length}</strong></li>
    `;

    reportRecordsBody.innerHTML = state.records.length
      ? state.records.map((record) => `
        <tr>
          <td>${record.studentName}</td>
          <td>${record.computerId}</td>
          <td>${record.department}</td>
          <td>${SmartLabUtils.formatDate(record.bookedDate)}</td>
          <td>${record.startTime} - ${record.endTime}</td>
          <td>${SmartLabUtils.formatDuration(record.startTime, record.endTime)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="6">No report records yet.</td></tr>';

    if (!reportMonthInput.value) {
      const current = new Date();
      reportMonthInput.value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    }
    await generateMonthlyReport();
  }

  async function generateMonthlyReport() {
    const month = reportMonthInput.value;
    const report = month ? await SmartLabData.getMonthlyReport(month) : await SmartLabData.getMonthlyReport();

    const entries = Object.entries(report.byDepartment || {}).map(([department, count]) => `
      <li><span>${department}</span><strong>${count}</strong></li>
    `).join('');

    monthlyReportSummary.innerHTML = `
      <div class="report-summary-grid">
        <div><span>Total records</span><strong>${report.totalRecords || 0}</strong></div>
        <div><span>Total hours</span><strong>${(report.totalHours || 0).toFixed(1)}h</strong></div>
      </div>
      <div class="report-breakdown">
        <h4>Department split</h4>
        <ul>${entries || '<li><span>No data</span><strong>0</strong></li>'}</ul>
      </div>
    `;
  }

  async function renderCharts() {
    const usageCtx = document.getElementById('usage-trend-chart');
    const departmentCtx = document.getElementById('department-chart');
    const statusCtx = document.getElementById('status-chart');

    if (!usageCtx || !departmentCtx || !statusCtx) {
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
    const fallbackDepartmentLabels = ['AI & DS', 'CSE', 'ECE'];
    const finalLabels = departmentLabels.length ? departmentLabels : fallbackDepartmentLabels;
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
  }

  function openComputerModal(computerId) {
    SmartLabData.loadState().then((state) => {
      const computer = state.computers.find((pc) => pc.id === computerId);
      if (!computer) return;

      modalBody.innerHTML = `
        <div class="summary-card">
          <div class="row"><span>Computer</span><strong>${computer.id}</strong></div>
          <div class="row"><span>Status</span><strong>${computer.status}</strong></div>
          <div class="row"><span>Student</span><strong>${computer.studentName || '—'}</strong></div>
          <div class="row"><span>Department</span><strong>${computer.department || '—'}</strong></div>
          <div class="row"><span>Last Seen</span><strong>${computer.lastSeen || '—'}</strong></div>
        </div>
      `;
      computerModal.classList.remove('hidden');
    });
  }

  document.getElementById('back-to-home-btn').addEventListener('click', () => {
    handleAdminBackFlow();
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    setAdminSession(false);
    showAdminLogin();
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
      if (section === 'computers') await renderComputerGrid();
      if (section === 'records') await renderRecords();
      if (section === 'students') await renderStudents();
      if (section === 'reports') await renderReports();
      if (section === 'analytics') await renderCharts();
    });
  });

  document.getElementById('computer-search').addEventListener('input', renderComputerGrid);
  document.getElementById('computer-filter').addEventListener('change', renderComputerGrid);
  document.getElementById('record-search').addEventListener('input', renderRecords);
  document.getElementById('record-status-filter').addEventListener('change', renderRecords);

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
    const exists = state.computers.some((pc) => pc.id.toLowerCase() === computerId.toLowerCase());
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
    const headers = ['studentName', 'registerNumber', 'department', 'computerId', 'bookedDate', 'startTime', 'endTime'];
    const rows = state.records.map((record) => headers.map((key) => '"' + String(record[key] ?? '').replace(/"/g, '""') + '"').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'smartlab-report.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    SmartLabUtils.showToast('Report export generated.', 'info');
  });

  document.getElementById('generate-monthly-report').addEventListener('click', generateMonthlyReport);
  document.getElementById('report-month').addEventListener('change', generateMonthlyReport);

  document.getElementById('export-monthly-report').addEventListener('click', async function () {
    const month = reportMonthInput.value;
    const report = await SmartLabData.getMonthlyReport(month || '');
    const headers = ['studentName', 'registerNumber', 'department', 'computerId', 'bookedDate', 'startTime', 'endTime'];
    const rows = (report.records || []).map((record) => headers.map((key) => '"' + String(record[key] ?? '').replace(/"/g, '""') + '"').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${month || 'monthly'}-smartlab-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    SmartLabUtils.showToast('Monthly report exported.', 'info');
  });

  document.querySelectorAll('[data-close="true"]').forEach((element) => {
    element.addEventListener('click', () => computerModal.classList.add('hidden'));
  });

  if (isAdminLoggedIn()) {
    showAdminDashboard();
    await renderAll();
  } else {
    showAdminLogin();
  }

  setPage('dashboard');
  await renderAll();
});
