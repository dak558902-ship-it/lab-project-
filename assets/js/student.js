document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('usage-form');
  const startRecordingBtn = document.getElementById('start-recording-btn');
  const cancelFormBtn = document.getElementById('cancel-form-btn');
  const newEntryBtn = document.getElementById('new-entry-btn');
  const welcomePanel = document.getElementById('welcome-panel');
  const formPanel = document.getElementById('form-panel');
  const successPanel = document.getElementById('success-panel');
  const computerStatusBadge = document.getElementById('computer-status-badge');
  const computerStatusLabel = document.getElementById('computer-status-label');
  const computerStatusMeta = document.getElementById('computer-status-meta');
  const computerIdInput = document.getElementById('computer-id');
  const summaryCard = document.getElementById('summary-card');
  const formError = document.getElementById('form-error');

  function setActivePanel(panelName) {
    welcomePanel.classList.toggle('active', panelName === 'welcome');
    formPanel.classList.toggle('active', panelName === 'form');
    successPanel.classList.toggle('active', panelName === 'success');
  }

  async function loadCurrentState() {
    return SmartLabData.loadState();
  }

  async function hydrateComputerOptions() {
    const state = await loadCurrentState();
    const select = document.getElementById('computer-id');
    if (!select) return;

    const allSystems = Array.from({ length: 60 }, (_, index) => `LAB-PC-${String(index + 1).padStart(2, '0')}`);
    const computerMap = new Map((state.computers || []).map((pc) => [pc.id, pc]));

    select.innerHTML = [
      '<option value="">Select a computer</option>',
      ...allSystems.map((systemId) => {
        const computer = computerMap.get(systemId);
        const isAvailable = computer && computer.status === 'AVAILABLE';
        const label = computer
          ? `${systemId} (${computer.status})`
          : `${systemId} (Available)`;

        return `<option value="${systemId}" ${!computer || isAvailable ? '' : 'disabled'}>${label}</option>`;
      })
    ].join('');

    const preferredComputer = (state.computers || []).find((pc) => pc.status === 'AVAILABLE') || (state.computers || [])[0] || null;
    const preferredValue = preferredComputer ? preferredComputer.id : '';
    if (preferredValue && computerMap.has(preferredValue)) {
      select.value = preferredValue;
    }
  }

  async function populateComputerStatus() {
    const state = await loadCurrentState();
    const availableComputers = (state.computers || []).filter((pc) => pc.status === 'AVAILABLE');

    if (!availableComputers.length) {
      computerStatusBadge.textContent = 'Offline';
      computerStatusBadge.className = 'status-badge neutral';
      computerStatusLabel.textContent = 'No computer available';
      computerStatusMeta.textContent = 'All lab machines are currently unavailable.';
      if (computerIdInput) {
        computerIdInput.value = 'LAB-PC-01';
      }
      return;
    }

    const computerId = availableComputers[0].id;
    if (computerIdInput) {
      computerIdInput.value = computerId;
    }
    computerStatusBadge.textContent = 'Available';
    computerStatusBadge.className = 'status-badge success';
    computerStatusLabel.textContent = `Computer ${computerId} is available`;
    computerStatusMeta.textContent = 'Students can continue to the usage form and choose their scheduled slot.';
  }

  async function resetForm() {
    form.reset();
    const state = await loadCurrentState();
    const preferredComputer = (state.computers || []).find((pc) => pc.status === 'AVAILABLE') || (state.computers || [])[0] || null;
    if (computerIdInput) {
      computerIdInput.value = preferredComputer ? preferredComputer.id : '';
    }
    formError.classList.add('hidden');
    formError.textContent = '';
    await hydrateComputerOptions();
    setActivePanel('form');
  }

  function showSummary(data) {
    const duration = SmartLabUtils.formatDuration(data.startTime, data.endTime);
    summaryCard.innerHTML = `
      <div class="row"><span>Student Name</span><strong>${SmartLabUtils.escapeHtml(data.studentName)}</strong></div>
      <div class="row"><span>Register Number</span><strong>${SmartLabUtils.escapeHtml(data.registerNumber)}</strong></div>
      <div class="row"><span>Department</span><strong>${SmartLabUtils.escapeHtml(data.department)}</strong></div>
      <div class="row"><span>Year</span><strong>${SmartLabUtils.escapeHtml(data.year)}</strong></div>
      <div class="row"><span>Computer ID</span><strong>${SmartLabUtils.escapeHtml(data.computerId)}</strong></div>
      <div class="row"><span>Booked Date</span><strong>${SmartLabUtils.formatDate(data.bookedDate)}</strong></div>
      <div class="row"><span>Time</span><strong>${data.startTime} - ${data.endTime}</strong></div>
      <div class="row"><span>Duration</span><strong>${duration}</strong></div>
    `;
  }

  startRecordingBtn.addEventListener('click', async () => {
    const state = await loadCurrentState();
    const availableComputer = (state.computers || []).find((pc) => pc.status === 'AVAILABLE');
    if (computerIdInput) {
      computerIdInput.value = availableComputer ? availableComputer.id : '';
    }
    await hydrateComputerOptions();
    if (computerIdInput) {
      const selected = computerIdInput.value || (availableComputer ? availableComputer.id : '');
      computerIdInput.value = selected;
    }
    setActivePanel('form');
  });

  cancelFormBtn.addEventListener('click', () => {
    setActivePanel('welcome');
  });

  newEntryBtn.addEventListener('click', async () => {
    await resetForm();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      studentName: (formData.get('studentName') || '').toString().trim(),
      registerNumber: (formData.get('registerNumber') || '').toString().trim(),
      department: (formData.get('department') || '').toString().trim(),
      year: (formData.get('year') || '').toString().trim(),
      computerId: (formData.get('computerId') || '').toString().trim(),
      bookedDate: (formData.get('bookedDate') || '').toString().trim(),
      startTime: (formData.get('startTime') || '').toString().trim(),
      endTime: (formData.get('endTime') || '').toString().trim()
    };

    if (!payload.studentName || !payload.registerNumber || !payload.department || !payload.year || !payload.computerId || !payload.bookedDate || !payload.startTime || !payload.endTime) {
      formError.textContent = 'Please complete all required fields before submitting your usage record.';
      formError.classList.remove('hidden');
      SmartLabUtils.showToast('Please complete all required fields.', 'error');
      return;
    }

    const state = await loadCurrentState();
    const computer = (state.computers || []).find((pc) => pc.id === payload.computerId);
    if (!computer) {
      formError.textContent = 'Please select a valid computer ID from the lab list.';
      formError.classList.remove('hidden');
      SmartLabUtils.showToast('Please select a valid computer ID.', 'error');
      return;
    }

    if (computer.status !== 'AVAILABLE') {
      formError.textContent = 'Selected computer is not available for new bookings. Please choose another workstation.';
      formError.classList.remove('hidden');
      SmartLabUtils.showToast('Computer is not available.', 'error');
      return;
    }

    if (SmartLabUtils.parseTimeToMinutes(payload.endTime) <= SmartLabUtils.parseTimeToMinutes(payload.startTime)) {
      formError.textContent = 'End time must be later than start time.';
      formError.classList.remove('hidden');
      SmartLabUtils.showToast('End time must be greater than start time.', 'error');
      return;
    }

    if (!SmartLabData.validateNoOverlap(payload.bookedDate, payload.computerId, payload.startTime, payload.endTime)) {
      formError.textContent = 'This computer already has a booking overlapping your selected time slot.';
      formError.classList.remove('hidden');
      SmartLabUtils.showToast('Time conflict detected.', 'error');
      return;
    }

    formError.classList.add('hidden');
    const record = await SmartLabData.addUsageRecord(payload);
    showSummary(record);
    setActivePanel('success');
    SmartLabUtils.showToast('Usage record submitted successfully.', 'success');
  });

  (async function initialize() {
    await hydrateComputerOptions();
    await populateComputerStatus();
    const state = await loadCurrentState();
    const preferredComputer = (state.computers || []).find((pc) => pc.status === 'AVAILABLE') || (state.computers || [])[0] || null;
    if (computerIdInput) {
      computerIdInput.value = preferredComputer ? preferredComputer.id : '';
    }
    setActivePanel('welcome');
  })();
});
