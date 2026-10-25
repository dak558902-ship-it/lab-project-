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
  const reviewSummary = document.getElementById('review-summary');
  const computerVisualGrid = document.getElementById('computer-visual-grid');
  const telemetrySummary = document.getElementById('telemetry-summary');

  let currentStep = 1;
  const totalSteps = 4;

  /* ── Panel Switching ────────────────────────────────────── */
  function setActivePanel(panelName) {
    welcomePanel.classList.toggle('active', panelName === 'welcome');
    formPanel.classList.toggle('active', panelName === 'form');
    successPanel.classList.toggle('active', panelName === 'success');
  }

  /* ── Wizard Step Navigation ─────────────────────────────── */
  function goToStep(step) {
    if (step < 1 || step > totalSteps) return;

    /* Hide all steps */
    document.querySelectorAll('.wizard-step').forEach(function (el) {
      el.classList.remove('active');
    });

    /* Show target step with animation */
    var targetStep = document.querySelector('[data-wizard-step="' + step + '"]');
    if (targetStep) {
      targetStep.classList.add('active');
      targetStep.classList.remove('animate-in');
      void targetStep.offsetWidth;
      targetStep.classList.add('animate-in');
    }

    /* Update step indicator */
    document.querySelectorAll('.step-node').forEach(function (node) {
      var nodeStep = parseInt(node.dataset.step, 10);
      node.classList.remove('active', 'completed');
      if (nodeStep === step) {
        node.classList.add('active');
      } else if (nodeStep < step) {
        node.classList.add('completed');
      }
    });

    document.querySelectorAll('.step-connector').forEach(function (conn) {
      var connStep = parseInt(conn.dataset.connector, 10);
      conn.classList.toggle('completed', connStep < step);
    });

    currentStep = step;

    /* Build review on step 4 */
    if (step === 4) {
      buildReview();
    }

    /* Build visual grid on step 2 */
    if (step === 2) {
      renderComputerVisualGrid();
    }
  }

  /* ── Visual Computer Picker ─────────────────────────────── */
  async function renderComputerVisualGrid() {
    var state = await loadCurrentState();
    var allSystems = Array.from({ length: 60 }, function (_, i) {
      return 'LAB-PC-' + String(i + 1).padStart(2, '0');
    });
    var computerMap = new Map((state.computers || []).map(function (pc) {
      return [pc.id, pc];
    }));

    computerVisualGrid.innerHTML = allSystems.map(function (sysId) {
      var pc = computerMap.get(sysId);
      var status = pc ? pc.status.toLowerCase().replace('_', '-') : 'available';
      var num = sysId.split('-').slice(-1)[0];
      var isAvailable = !pc || pc.status === 'AVAILABLE';
      var isSelected = computerIdInput.value === sysId;
      var classes = ['pc-pick-node', status];
      if (isSelected) classes.push('selected');
      if (!isAvailable) classes.push('disabled');
      return '<div class="' + classes.join(' ') + '" data-pc-id="' + sysId + '" title="' + sysId + ' (' + (pc ? pc.status : 'Available') + ')">' + num + '</div>';
    }).join('');

    /* Click handler for nodes */
    computerVisualGrid.querySelectorAll('.pc-pick-node:not(.disabled)').forEach(function (node) {
      node.addEventListener('click', function () {
        computerVisualGrid.querySelectorAll('.pc-pick-node').forEach(function (n) {
          n.classList.remove('selected');
        });
        node.classList.add('selected');
        computerIdInput.value = node.dataset.pcId;
      });
    });
  }

  /* ── Build Review Summary ───────────────────────────────── */
  function buildReview() {
    var formData = new FormData(form);
    var fields = [
      { label: 'Student Name', key: 'studentName' },
      { label: 'Register Number', key: 'registerNumber' },
      { label: 'Department', key: 'department' },
      { label: 'Year', key: 'year' },
      { label: 'Computer', key: 'computerId' },
      { label: 'Date', key: 'bookedDate' },
      { label: 'Start Time', key: 'startTime' },
      { label: 'End Time', key: 'endTime' }
    ];

    reviewSummary.innerHTML = fields.map(function (field) {
      var value = (formData.get(field.key) || '').toString().trim();
      if (field.key === 'bookedDate' && value) {
        value = SmartLabUtils.formatDate(value);
      }
      return '<div class="row"><span>' + field.label + '</span><strong>' + SmartLabUtils.escapeHtml(value || '—') + '</strong></div>';
    }).join('');

    var start = (formData.get('startTime') || '').toString().trim();
    var end = (formData.get('endTime') || '').toString().trim();
    if (start && end) {
      reviewSummary.innerHTML += '<div class="row"><span>Duration</span><strong>' + SmartLabUtils.formatDuration(start, end) + '</strong></div>';
    }
  }

  /* ── Button Ripple Effect ───────────────────────────────── */
  document.querySelectorAll('.btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var ring = document.createElement('span');
      ring.className = 'ripple-ring';
      var rect = btn.getBoundingClientRect();
      ring.style.left = (e.clientX - rect.left - 30) + 'px';
      ring.style.top = (e.clientY - rect.top - 30) + 'px';
      btn.appendChild(ring);
      ring.addEventListener('animationend', function () { ring.remove(); });
    });
  });

  /* ── Wizard Navigation Buttons ──────────────────────────── */
  document.querySelectorAll('.wizard-next').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextStep = parseInt(btn.dataset.next, 10);
      goToStep(nextStep);
    });
  });

  document.querySelectorAll('.wizard-prev').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var prevStep = parseInt(btn.dataset.prev, 10);
      goToStep(prevStep);
    });
  });

  /* ── Data Loading ───────────────────────────────────────── */
  async function loadCurrentState() {
    return SmartLabData.loadState();
  }

  async function hydrateComputerOptions() {
    var state = await loadCurrentState();
    var select = document.getElementById('computer-id');
    if (!select) return;

    var allSystems = Array.from({ length: 60 }, function (_, index) {
      return 'LAB-PC-' + String(index + 1).padStart(2, '0');
    });
    var computerMap = new Map((state.computers || []).map(function (pc) {
      return [pc.id, pc];
    }));

    select.innerHTML = [
      '<option value="">Select a computer</option>',
      ...allSystems.map(function (systemId) {
        var computer = computerMap.get(systemId);
        var isAvailable = !computer || computer.status === 'AVAILABLE';
        var label = computer ? systemId + ' (' + computer.status + ')' : systemId + ' (Available)';
        return '<option value="' + systemId + '" ' + (isAvailable ? '' : 'disabled') + '>' + label + '</option>';
      })
    ].join('');

    var preferredComputer = (state.computers || []).find(function (pc) {
      return pc.status === 'AVAILABLE';
    }) || (state.computers || [])[0] || null;
    var preferredValue = preferredComputer ? preferredComputer.id : '';
    if (preferredValue && computerMap.has(preferredValue)) {
      select.value = preferredValue;
    }
  }

  async function populateComputerStatus() {
    var state = await loadCurrentState();
    var availableComputers = (state.computers || []).filter(function (pc) {
      return pc.status === 'AVAILABLE';
    });

    if (!availableComputers.length) {
      computerStatusBadge.textContent = 'Offline';
      computerStatusBadge.className = 'status-badge neutral';
      computerStatusLabel.textContent = 'No computer available';
      computerStatusMeta.textContent = 'All lab machines are currently unavailable.';
      if (computerIdInput) computerIdInput.value = 'LAB-PC-01';
      return;
    }

    var computerId = availableComputers[0].id;
    if (computerIdInput) computerIdInput.value = computerId;
    computerStatusBadge.textContent = 'Available';
    computerStatusBadge.className = 'status-badge success';
    computerStatusLabel.textContent = 'Computer ' + computerId + ' is available';
    computerStatusMeta.textContent = availableComputers.length + ' computers ready for check-in.';
  }

  /* ── Live Telemetry ─────────────────────────────────────── */
  function renderLiveTelemetry(state) {
    var available = (state.computers || []).filter(function (pc) { return pc.status === 'AVAILABLE'; }).length;
    var inUse = (state.computers || []).filter(function (pc) { return pc.status === 'IN_USE'; }).length;
    var total = (state.computers || []).length;
    var latest = (state.records || [])[0];

    if (!telemetrySummary) return;

    telemetrySummary.innerHTML = [
      '<div class="telemetry-card">',
      '  <p class="label">Available</p>',
      '  <strong>' + available + '</strong>',
      '  <span>' + (total - available) + ' occupied</span>',
      '</div>',
      '<div class="telemetry-card">',
      '  <p class="label">In Use</p>',
      '  <strong>' + inUse + '</strong>',
      '  <span>Live sessions</span>',
      '</div>',
      '<div class="telemetry-card">',
      '  <p class="label">Latest Booking</p>',
      '  <strong>' + (latest ? latest.computerId : '—') + '</strong>',
      '  <span>' + (latest ? latest.studentName + ' • ' + latest.startTime : 'Awaiting activity') + '</span>',
      '</div>'
    ].join('\n');
  }

  async function resetForm() {
    form.reset();
    var state = await loadCurrentState();
    var preferredComputer = (state.computers || []).find(function (pc) {
      return pc.status === 'AVAILABLE';
    }) || (state.computers || [])[0] || null;
    if (computerIdInput) computerIdInput.value = preferredComputer ? preferredComputer.id : '';
    formError.classList.add('hidden');
    formError.textContent = '';
    await hydrateComputerOptions();
    currentStep = 1;
    goToStep(1);
    setActivePanel('form');
  }

  function refreshSessionAvailability() {
    populateComputerStatus();
    hydrateComputerOptions();
    loadCurrentState().then(function (state) {
      renderLiveTelemetry(state);
    });
  }

  function showSummary(data) {
    var duration = SmartLabUtils.formatDuration(data.startTime, data.endTime);
    summaryCard.innerHTML = [
      '<div class="row"><span>Student Name</span><strong>' + SmartLabUtils.escapeHtml(data.studentName) + '</strong></div>',
      '<div class="row"><span>Register Number</span><strong>' + SmartLabUtils.escapeHtml(data.registerNumber) + '</strong></div>',
      '<div class="row"><span>Department</span><strong>' + SmartLabUtils.escapeHtml(data.department) + '</strong></div>',
      '<div class="row"><span>Year</span><strong>' + SmartLabUtils.escapeHtml(data.year) + '</strong></div>',
      '<div class="row"><span>Computer ID</span><strong>' + SmartLabUtils.escapeHtml(data.computerId) + '</strong></div>',
      '<div class="row"><span>Booked Date</span><strong>' + SmartLabUtils.formatDate(data.bookedDate) + '</strong></div>',
      '<div class="row"><span>Time</span><strong>' + data.startTime + ' - ' + data.endTime + '</strong></div>',
      '<div class="row"><span>Duration</span><strong>' + duration + '</strong></div>'
    ].join('');
  }

  /* ── Event Listeners ────────────────────────────────────── */
  startRecordingBtn.addEventListener('click', async function () {
    var state = await loadCurrentState();
    var availableComputer = (state.computers || []).find(function (pc) {
      return pc.status === 'AVAILABLE';
    });
    if (computerIdInput) computerIdInput.value = availableComputer ? availableComputer.id : '';
    await hydrateComputerOptions();
    if (computerIdInput) {
      var selected = computerIdInput.value || (availableComputer ? availableComputer.id : '');
      computerIdInput.value = selected;
    }
    currentStep = 1;
    goToStep(1);
    setActivePanel('form');
  });

  cancelFormBtn.addEventListener('click', function () {
    setActivePanel('welcome');
    refreshSessionAvailability();
  });

  newEntryBtn.addEventListener('click', async function () {
    await resetForm();
    refreshSessionAvailability();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var formData = new FormData(form);
    var payload = {
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

    var state = await loadCurrentState();
    var computer = (state.computers || []).find(function (pc) { return pc.id === payload.computerId; });
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
    var record = await SmartLabData.addUsageRecord(payload);
    showSummary(record);
    setActivePanel('success');
    refreshSessionAvailability();
    SmartLabUtils.showToast('Usage record submitted successfully.', 'success');
  });

  /* ── Live state update listener ─────────────────────────── */
  window.addEventListener('smartlab-state-updated', function () {
    loadCurrentState().then(function (state) {
      renderLiveTelemetry(state);
      populateComputerStatus();
    });
  });

  /* ── Initialize ─────────────────────────────────────────── */
  (async function initialize() {
    await hydrateComputerOptions();
    await populateComputerStatus();
    var state = await loadCurrentState();
    renderLiveTelemetry(state);
    var preferredComputer = (state.computers || []).find(function (pc) {
      return pc.status === 'AVAILABLE';
    }) || (state.computers || [])[0] || null;
    if (computerIdInput) computerIdInput.value = preferredComputer ? preferredComputer.id : '';
    setActivePanel('welcome');
    SmartLabData.ensureLiveRefresh();
  })();
});
