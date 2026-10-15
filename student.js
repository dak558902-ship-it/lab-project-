document.addEventListener('DOMContentLoaded', async function () {
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

  async function populateComputerStatus() {
    const state = await loadCurrentState();
    const availableComputer = state.computers.find((pc) => pc.status === 'AVAILABLE');
    if (!availableComputer) {
      computerStatusBadge.textContent = 'Offline';
      computerStatusBadge.className = 'status-badge neutral';
      computerStatusLabel.textContent = 'No computer available';
      computerStatusMeta.textContent = 'All lab machines are currently unavailable.';
      computerIdInput.value = 'LAB-PC-01';
      return;
    }

    const computerId = availableComputer.id;
    computerIdInput.value = computerId;
    computerStatusBadge.textContent = 'Available';
    computerStatusBadge.className = 'status-badge success';
    computerStatusLabel.textContent = `Computer ${computerId} is available`;
    computerStatusMeta.textContent = 'Students can continue to the usage form and choose their scheduled slot.';
  }

  async function resetForm() {
    form.reset();
    const state = await loadCurrentState();
    const availableComputer = state.computers.find((pc) => pc.status === 'AVAILABLE');
    computerIdInput.value = availableComputer ? availableComputer.id : 'LAB-PC-01';
    formError.classList.add('hidden');
    formError.textContent = '';
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
    const availableComputer = state.computers.find((pc) => pc.status === 'AVAILABLE');
    if (availableComputer) {
      computerIdInput.value = availableComputer.id;
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
    const computer = state.computers.find((pc) => pc.id === payload.computerId);
    if (!computer || computer.status !== 'AVAILABLE') {
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

  await populateComputerStatus();
  const initState = await loadCurrentState();
  const initComputer = initState.computers.find((pc) => pc.status === 'AVAILABLE');
  computerIdInput.value = initComputer ? initComputer.id : 'LAB-PC-01';
  setActivePanel('welcome');
});
