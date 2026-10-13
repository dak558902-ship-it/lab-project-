/**
 * SmartLab Monitor — Admin Dashboard Logic (admin.js)
 *
 * Usage-record based system.
 * Computer status = derived from records + current time.
 * No session concept.
 */

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let currentAdmin  = null;
let currentPage   = 'dashboard';
let currentCompTab = 'all';
let deleteRecordId = null;
let editRecordId   = null;
let viewRecordId   = null;
let reportRecords  = [];
let recCurrentPage = 1;
const REC_PER_PAGE = 20;
let detailPcId = null;
let heartbeatTimer = null;
let lstatTimer = null;

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
function toast(msg, type = 'info', dur = 3200) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||''}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, dur);
}

function getEl(id) { return document.getElementById(id); }

function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return DB.formatDatePretty(new Date(isoString).toISOString().slice(0,10));
}

function remainingMinutes(endHHMM) {
  const endMin  = DB.timeToMinutes(endHHMM);
  const nowMin  = DB.timeToMinutes(DB.currentHHMM());
  const diff    = endMin - nowMin;
  if (diff <= 0) return 'Completed';
  const h = Math.floor(diff/60), m = diff%60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function pcInitials(name) {
  return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
}

function badgeHTML(text, cls) {
  return `<span class="badge badge-dot ${cls}">${text}</span>`;
}

/* ══════════════════════════════════════════════════════════
   CLOCK / HEADER DATE
══════════════════════════════════════════════════════════ */
function updateHeaderDate() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
  getEl('header-date').textContent = `${dateStr}  ·  ${timeStr}`;
}
updateHeaderDate();
setInterval(updateHeaderDate, 30000);

/* ══════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════ */
(function initLoginStats() {
  try {
    const s = DB.getStats();
    getEl('lstat-today').textContent  = s.todayRecords;
    getEl('lstat-avail').textContent  = s.available;
    getEl('lstat-total').textContent  = s.totalRecords;
  } catch{}
})();

getEl('l-pass').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
getEl('btn-login').addEventListener('click', doLogin);

function doLogin() {
  const user = getEl('l-user').value.trim();
  const pass = getEl('l-pass').value;
  const err  = getEl('login-error');
  if (!user || !pass) { err.style.display='block'; err.textContent='Please enter username and password.'; return; }
  if (!DB.verifyAdmin(user, pass)) { err.style.display='block'; err.textContent='Invalid username or password.'; return; }
  err.style.display = 'none';
  currentAdmin = user;
  DB.addAuditLog(user, 'LOGIN', `Admin "${user}" logged in successfully.`);
  toast(`Welcome back, ${user}!`, 'success');
  getEl('login-page').style.display = 'none';
  getEl('admin-app').classList.add('visible');
  getEl('sb-admin-name').textContent = user;
  getEl('sb-avatar-letter').textContent = user[0].toUpperCase();
  getEl('header-avatar').textContent = user[0].toUpperCase();
  getEl('header-admin-name').textContent = user;
  populateFilters();
  initSettingsForm();
  navigateTo('dashboard');
  startHeartbeatSimulation();
  startNotifPolling();
}

getEl('btn-logout').addEventListener('click', () => {
  if (confirm('Are you sure you want to logout?')) {
    DB.addAuditLog(currentAdmin||'Admin', 'LOGIN', 'Admin logged out.');
    location.reload();
  }
});

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
const pageTitles = {
  dashboard:  ['Laboratory Overview',   'Monitor computer availability and laboratory usage'],
  computers:  ['Computer Monitoring',   'View status of all 60 laboratory computers'],
  map:        ['Computer Lab Layout',   'Visual representation of the laboratory floor plan'],
  records:    ['Usage Records',         'Browse, search and manage all usage records'],
  students:   ['Student Directory',     'Registered students and their usage history'],
  reports:    ['Reports & Exports',     'Generate and export laboratory usage reports'],
  analytics:  ['Laboratory Analytics',  'Data insights and usage patterns'],
  settings:   ['System Settings',       'Configure SmartLab Monitor preferences'],
  audit:      ['Audit Logs',            'Administrator action audit trail'],
};

document.querySelectorAll('.sb-item[data-page]').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.page));
});

function navigateTo(page) {
  currentPage = page;

  // Sidebar active state
  document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.sb-item[data-page="${page}"]`);
  if (active) active.classList.add('active');

  // Page header
  const [title, sub] = pageTitles[page] || ['SmartLab Monitor',''];
  getEl('header-title').textContent = title;
  getEl('header-sub').textContent   = sub;

  // Pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = getEl(`page-${page}`);
  if (pg) pg.classList.add('active');

  // Load page data
  switch(page) {
    case 'dashboard': loadDashboard();   break;
    case 'computers': loadComputers();   break;
    case 'map':       loadLabMap();      break;
    case 'records':   loadRecords();     break;
    case 'students':  loadStudents();    break;
    case 'reports':   loadReports();     break;
    case 'analytics': loadAnalytics();   break;
    case 'settings':  /* already init */ break;
    case 'audit':     loadAudit();       break;
  }
}

/* ══════════════════════════════════════════════════════════
   POPULATE DEPT FILTERS
══════════════════════════════════════════════════════════ */
function populateFilters() {
  const settings = DB.getSettings();
  const depts = settings.departments || [];

  ['rec-dept','stu-dept-filter','rpt-dept','edit-dept'].forEach(id => {
    const sel = getEl(id);
    if (!sel) return;
    const first = sel.options[0];
    sel.innerHTML = '';
    if (first) sel.appendChild(first);
    depts.forEach(d => {
      const o = document.createElement('option');
      o.value = o.textContent = d;
      sel.appendChild(o);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function loadDashboard() {
  const stats = DB.getStats();
  getEl('kpi-total').textContent   = stats.total;
  getEl('kpi-avail').textContent   = stats.available;
  getEl('kpi-inuse').textContent   = stats.inUse;
  getEl('kpi-offline').textContent = stats.offline;
  getEl('kpi-today').textContent   = stats.todayRecords;
  renderDashGrid();
  renderRecentRecords();
}

function renderDashGrid() {
  const computers = DB.getAllComputersWithStatus();
  const grid = getEl('dash-pc-grid');
  grid.innerHTML = '';
  computers.slice(0,20).forEach(c => {
    grid.appendChild(buildPcTile(c, 'dashboard'));
  });
}

function renderRecentRecords() {
  const records = DB.filterRecords({}).slice(0,10);
  const tbody = getEl('dash-recent-tbody');
  const empty = getEl('dash-recent-empty');

  if (!records.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = records.map(r => `
    <tr>
      <td>${DB.formatDatePretty(r.date)}</td>
      <td><strong>${esc(r.studentName)}</strong></td>
      <td><span class="mono" style="font-size:12px;color:#6366f1">${esc(r.registerNo)}</span></td>
      <td><span class="badge badge-primary">${esc(r.department)}</span></td>
      <td>${esc(r.year)}</td>
      <td><span class="mono" style="font-size:12px">${esc(r.computerCode)}</span></td>
      <td>${DB.formatHHMM(r.startTime)}</td>
      <td>${DB.formatHHMM(r.endTime)}</td>
      <td><strong>${r.duration}</strong></td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════════════════════
   COMPUTER TILE BUILDER
══════════════════════════════════════════════════════════ */
function buildPcTile(c, context = 'computers') {
  const tile = document.createElement('div');
  let tileClass = 'pc-tile';
  let statusBadge, onlineText, extraInfo = '';

  if (!c.isOnline) {
    tileClass += ' offline';
    statusBadge = badgeHTML('OFFLINE', 'badge-offline');
    onlineText = `<span class="pc-tile-online-dot" style="background:#ef4444"></span>Offline`;
    extraInfo  = `<div class="pc-tile-student">${formatRelativeTime(c.lastSeen)}</div>`;
  } else if (c.availStatus === 'IN_USE' && c.currentRecord) {
    tileClass += ' inuse';
    statusBadge = badgeHTML('IN USE', 'badge-inuse');
    onlineText = `<span class="pc-tile-online-dot" style="background:#22c55e"></span>Online`;
    extraInfo  = `<div class="pc-tile-student">${esc(c.currentRecord.studentName)}</div>
      <div class="pc-tile-time">${DB.formatHHMM(c.currentRecord.startTime)} – ${DB.formatHHMM(c.currentRecord.endTime)}</div>`;
  } else {
    tileClass += ' avail';
    statusBadge = badgeHTML('AVAILABLE', 'badge-available');
    onlineText = `<span class="pc-tile-online-dot" style="background:#22c55e"></span>Online`;
  }

  tile.className = tileClass;
  tile.innerHTML = `
    <div class="pc-tile-id">${esc(c.code)}</div>
    <div class="pc-tile-status-badge">${statusBadge}</div>
    <div class="pc-tile-online">${onlineText}</div>
    ${extraInfo}`;

  tile.addEventListener('click', () => {
    if (context === 'dashboard') { navigateTo('computers'); showComputerDetail(c.id); }
    else if (context === 'computers') showComputerDetail(c.id);
    else if (context === 'map') { navigateTo('computers'); showComputerDetail(c.id); }
  });

  return tile;
}

/* ══════════════════════════════════════════════════════════
   COMPUTERS PAGE
══════════════════════════════════════════════════════════ */
function loadComputers() {
  // Hide detail
  getEl('comp-detail').style.display = 'none';
  renderComputerGrid();
}

function renderComputerGrid() {
  const computers = DB.getAllComputersWithStatus();
  const search = (getEl('comp-search').value || '').toLowerCase();
  const tab = currentCompTab;

  let filtered = computers.filter(c => {
    if (search && !c.code.toLowerCase().includes(search)) return false;
    if (tab === 'avail')   return c.isOnline && c.availStatus === 'AVAILABLE';
    if (tab === 'inuse')   return c.availStatus === 'IN_USE';
    if (tab === 'offline') return !c.isOnline;
    return true;
  });

  const grid  = getEl('comp-grid');
  const empty = getEl('comp-empty');
  grid.innerHTML = '';

  if (!filtered.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  filtered.forEach(c => grid.appendChild(buildPcTile(c, 'computers')));
}

// Tab switching
document.querySelectorAll('.tab[data-comptab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-comptab]').forEach(t => t.classList.remove('tab-active'));
    tab.classList.add('tab-active');
    currentCompTab = tab.dataset.comptab;
    renderComputerGrid();
  });
});

getEl('comp-search').addEventListener('input', renderComputerGrid);

// Refresh dashboard button
getEl('btn-refresh-dash').addEventListener('click', () => { DB.simulateHeartbeats(); loadDashboard(); toast('Dashboard refreshed', 'info', 2000); });

/* Computer Detail */
function showComputerDetail(pcId) {
  detailPcId = pcId;
  const c = DB.getComputerWithStatus(pcId);
  if (!c) return;

  const grid = getEl('comp-grid');
  grid.style.display = 'none';
  document.querySelector('.page-tabs')?.style && (document.querySelector('.page-tabs').style.display='none');
  document.querySelector('.filter-bar')?.style && (document.querySelector('.filter-bar').style.display='none');

  getEl('comp-detail').style.display = 'block';
  getEl('detail-pc-id').textContent = c.code;
  getEl('d-code').textContent = c.code;
  getEl('d-ip').textContent   = c.ip || '—';
  getEl('d-loc').textContent  = c.location || '—';
  getEl('d-seen').textContent = formatRelativeTime(c.lastSeen);

  const allRecs = DB.filterRecords({ computerId: pcId });
  const todayRecs = allRecs.filter(r => r.date === DB.todayISO());
  getEl('d-today').textContent = todayRecs.length;
  getEl('d-total').textContent = allRecs.length;

  // Status badges
  getEl('detail-status-badge').innerHTML = c.availStatus === 'IN_USE'
    ? badgeHTML('IN USE', 'badge-inuse')
    : c.isOnline ? badgeHTML('AVAILABLE', 'badge-available') : badgeHTML('OFFLINE', 'badge-offline');
  getEl('detail-online-badge').innerHTML = c.isOnline
    ? badgeHTML('Online', 'badge-online')
    : '<span class="badge badge-offline">Offline</span>';

  // Current usage
  const cuSection = getEl('current-usage-section');
  if (c.availStatus === 'IN_USE' && c.currentRecord) {
    const r = c.currentRecord;
    cuSection.style.display = 'block';
    getEl('cu-student').textContent  = r.studentName;
    getEl('cu-regno').textContent    = r.registerNo;
    getEl('cu-dept').textContent     = r.department;
    getEl('cu-year').textContent     = r.year;
    getEl('cu-start').textContent    = DB.formatHHMM(r.startTime);
    getEl('cu-end').textContent      = DB.formatHHMM(r.endTime);
    getEl('cu-remaining').textContent = remainingMinutes(r.endTime);
  } else {
    cuSection.style.display = 'none';
  }

  renderDetailHistory(pcId);
}

function renderDetailHistory(pcId, search='', date='') {
  let recs = DB.filterRecords({ computerId: pcId });
  if (search) { const q=search.toLowerCase(); recs=recs.filter(r=>r.studentName.toLowerCase().includes(q)||r.registerNo.toLowerCase().includes(q)); }
  if (date)   recs = recs.filter(r=>r.date===date);

  const tbody = getEl('detail-hist-tbody');
  const empty = getEl('detail-hist-empty');
  tbody.innerHTML = '';

  if (!recs.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = recs.map(r=>`
    <tr>
      <td>${DB.formatDatePretty(r.date)}</td>
      <td>${esc(r.studentName)}</td>
      <td><span class="mono" style="font-size:12px;color:#6366f1">${esc(r.registerNo)}</span></td>
      <td>${esc(r.department)}</td>
      <td>${DB.formatHHMM(r.startTime)}</td>
      <td>${DB.formatHHMM(r.endTime)}</td>
      <td><strong>${r.duration}</strong></td>
    </tr>`).join('');
}

getEl('detail-back').addEventListener('click', () => {
  getEl('comp-detail').style.display = 'none';
  getEl('comp-grid').style.display   = 'grid';
  document.querySelector('.page-tabs').style.display = 'flex';
  document.querySelector('#page-computers .filter-bar').style.display = 'flex';
  detailPcId = null;
});
getEl('detail-hist-search').addEventListener('input', e => {
  if (detailPcId) renderDetailHistory(detailPcId, e.target.value, getEl('detail-hist-date').value);
});
getEl('detail-hist-date').addEventListener('change', e => {
  if (detailPcId) renderDetailHistory(detailPcId, getEl('detail-hist-search').value, e.target.value);
});

/* Add Computer */
getEl('btn-add-computer').addEventListener('click', () => {
  getEl('ac-code').value = '';
  getEl('ac-ip').value   = '';
  getEl('ac-loc').value  = '';
  getEl('ac-error').style.display = 'none';
  getEl('modal-add-comp').classList.remove('hidden');
});
getEl('btn-ac-cancel').addEventListener('click', () => getEl('modal-add-comp').classList.add('hidden'));
getEl('btn-ac-save').addEventListener('click', () => {
  const code = getEl('ac-code').value.trim().toUpperCase();
  const ip   = getEl('ac-ip').value.trim();
  const loc  = getEl('ac-loc').value.trim();
  const errEl = getEl('ac-error');
  if (!code) { errEl.textContent='Computer code is required.'; errEl.style.display='block'; return; }
  try {
    DB.addComputer({ code, ip, location: loc });
    DB.addAuditLog(currentAdmin, 'ADD_COMPUTER', `Added computer ${code}`);
    getEl('modal-add-comp').classList.add('hidden');
    toast(`Computer ${code} added successfully.`, 'success');
    renderComputerGrid();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
});

/* ══════════════════════════════════════════════════════════
   LAB MAP
══════════════════════════════════════════════════════════ */
function loadLabMap() {
  const computers = DB.getAllComputersWithStatus();
  const mapWrap = getEl('lab-map-rows');
  mapWrap.innerHTML = '';

  // Group by row letter
  const rows = {};
  computers.forEach(c => {
    const row = c.row || 'A';
    if (!rows[row]) rows[row] = [];
    rows[row].push(c);
  });

  Object.entries(rows).sort(([a],[b])=>a.localeCompare(b)).forEach(([row, pcs]) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'map-row';
    rowDiv.innerHTML = `<div class="map-row-label">Row ${row}</div><div class="map-pcs"></div>`;
    const pcsDiv = rowDiv.querySelector('.map-pcs');

    pcs.forEach(c => {
      const num = c.code.replace('LAB-PC-','');
      const div = document.createElement('div');
      let cls = 'map-pc avail';
      if (!c.isOnline) cls = 'map-pc offline';
      else if (c.availStatus === 'IN_USE') cls = 'map-pc inuse';
      div.className = cls;
      div.innerHTML = `<div class="map-pc-num">${num}</div><div class="map-pc-lbl">${c.availStatus === 'IN_USE' ? 'USE' : c.isOnline ? 'AVL' : 'OFF'}</div>`;
      div.title = c.code + (c.currentRecord ? ` — ${c.currentRecord.studentName}` : '');
      div.addEventListener('click', () => { navigateTo('computers'); showComputerDetail(c.id); });
      pcsDiv.appendChild(div);
    });

    mapWrap.appendChild(rowDiv);
  });
}

/* ══════════════════════════════════════════════════════════
   USAGE RECORDS PAGE
══════════════════════════════════════════════════════════ */
function loadRecords() {
  // Set default dates
  const today = DB.todayISO();
  if (!getEl('rec-from').value) getEl('rec-from').value = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  if (!getEl('rec-to').value)   getEl('rec-to').value   = today;
  renderRecords();
}

function getRecFilters() {
  return {
    search: getEl('rec-search').value,
    dateFrom: getEl('rec-from').value,
    dateTo:   getEl('rec-to').value,
    department: getEl('rec-dept').value,
    year:       getEl('rec-year').value,
  };
}

function renderRecords() {
  const filtered = DB.filterRecords(getRecFilters());
  const total = filtered.length;
  getEl('rec-count-label').textContent = `${total} record${total !== 1 ? 's' : ''} found`;

  const totalPages = Math.ceil(total / REC_PER_PAGE);
  const page = Math.min(recCurrentPage, totalPages || 1);
  recCurrentPage = page;
  const slice = filtered.slice((page-1)*REC_PER_PAGE, page*REC_PER_PAGE);

  const tbody = getEl('rec-tbody');
  const empty = getEl('rec-empty');

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    getEl('rec-pagination').innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = slice.map(r => `
    <tr>
      <td>${DB.formatDatePretty(r.date)}</td>
      <td><strong>${esc(r.studentName)}</strong></td>
      <td><span class="mono" style="font-size:12px;color:#6366f1">${esc(r.registerNo)}</span></td>
      <td>${esc(r.department)}</td>
      <td>${esc(r.year)}</td>
      <td><span class="mono" style="font-size:12px">${esc(r.computerCode)}</span></td>
      <td>${DB.formatHHMM(r.startTime)}</td>
      <td>${DB.formatHHMM(r.endTime)}</td>
      <td><strong>${r.duration}</strong></td>
      <td style="text-align:center;white-space:nowrap">
        <div style="display:flex;gap:5px;justify-content:center">
          <button class="btn btn-ghost btn-xs" onclick="openViewRecord('${r.id}')">View</button>
          <button class="btn btn-secondary btn-xs" onclick="openEditRecord('${r.id}')">Edit</button>
          <button class="btn btn-danger btn-xs" onclick="openDeleteRecord('${r.id}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');

  renderPagination(page, totalPages);
}

function renderPagination(current, total) {
  const el = getEl('rec-pagination');
  if (total <= 1) { el.innerHTML=''; return; }
  let html = `<button class="page-btn" ${current<=1?'disabled':''} onclick="goToPage(${current-1})">←</button>`;
  for (let i=1;i<=total;i++) {
    if (i===1||i===total||Math.abs(i-current)<=2)
      html += `<button class="page-btn${i===current?' active':''}" onclick="goToPage(${i})">${i}</button>`;
    else if (Math.abs(i-current)===3)
      html += `<span style="color:var(--text4);padding:0 4px">…</span>`;
  }
  html += `<button class="page-btn" ${current>=total?'disabled':''} onclick="goToPage(${current+1})">→</button>`;
  el.innerHTML = html;
}

function goToPage(page) {
  recCurrentPage = page;
  renderRecords();
}

// Filter listeners
['rec-search','rec-from','rec-to','rec-dept','rec-year'].forEach(id => {
  getEl(id)?.addEventListener('change', () => { recCurrentPage=1; renderRecords(); });
  getEl(id)?.addEventListener('input',  () => { recCurrentPage=1; renderRecords(); });
});

getEl('btn-rec-clear').addEventListener('click', () => {
  getEl('rec-search').value='';
  getEl('rec-from').value='';
  getEl('rec-to').value='';
  getEl('rec-dept').value='all';
  getEl('rec-year').value='all';
  recCurrentPage=1;
  renderRecords();
});

// Export
getEl('btn-rec-excel').addEventListener('click',() => DB.exportExcel(DB.filterRecords(getRecFilters())));
getEl('btn-rec-csv').addEventListener('click',  () => DB.exportCSV(  DB.filterRecords(getRecFilters())));
getEl('btn-rec-pdf').addEventListener('click',  () => DB.exportPDF(  DB.filterRecords(getRecFilters())));

/* ── View Record ── */
function openViewRecord(id) {
  viewRecordId = id;
  const r = DB.getRecordById(id);
  if (!r) return;
  getEl('modal-view-content').innerHTML = `
    <div style="background:var(--surface2);border-radius:12px;overflow:hidden;margin-bottom:4px">
      ${[['Student',r.studentName],['Register No',r.registerNo],['Department',r.department],['Year',r.year],
         ['Computer',r.computerCode],['Date',DB.formatDatePretty(r.date)],
         ['Start',DB.formatHHMM(r.startTime)],['End',DB.formatHHMM(r.endTime)],['Duration',r.duration]]
        .map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border)">
          <span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">${l}</span>
          <span style="font-size:13px;font-weight:600;color:var(--text)">${esc(v)}</span>
        </div>`).join('')}
    </div>
    ${r.editedAt ? `<div style="font-size:11px;color:var(--text4);margin-top:8px">Last edited ${formatRelativeTime(r.editedAt)} by ${esc(r.editedBy||'Admin')}</div>` : ''}`;
  getEl('modal-view').classList.remove('hidden');
}
getEl('btn-view-close').addEventListener('click', () => getEl('modal-view').classList.add('hidden'));
getEl('btn-view-edit').addEventListener('click', () => { getEl('modal-view').classList.add('hidden'); openEditRecord(viewRecordId); });

/* ── Edit Record ── */
function openEditRecord(id) {
  editRecordId = id;
  const r = DB.getRecordById(id);
  if (!r) return;

  getEl('edit-name').value  = r.studentName;
  getEl('edit-regno').value = r.registerNo;
  getEl('edit-dept').value  = r.department;
  getEl('edit-year').value  = r.year;
  getEl('edit-date').value  = r.date;
  getEl('edit-start').value = r.startTime;
  getEl('edit-end').value   = r.endTime;
  getEl('edit-error').style.display = 'none';

  // Populate computers in edit modal
  const compSel = getEl('edit-computer');
  compSel.innerHTML = DB.getComputers().map(c => `<option value="${c.id}" ${c.id===r.computerId?'selected':''}>${c.code}</option>`).join('');

  updateEditDuration();
  getEl('modal-edit').classList.remove('hidden');
}

function updateEditDuration() {
  const s = getEl('edit-start').value;
  const e = getEl('edit-end').value;
  if (s && e && DB.timeToMinutes(e) > DB.timeToMinutes(s))
    getEl('edit-dur-val').textContent = DB.calcDuration(s, e);
  else
    getEl('edit-dur-val').textContent = '—';
}
getEl('edit-start').addEventListener('change', updateEditDuration);
getEl('edit-end').addEventListener('change', updateEditDuration);

getEl('btn-edit-cancel').addEventListener('click', () => getEl('modal-edit').classList.add('hidden'));
getEl('btn-edit-save').addEventListener('click', () => {
  const err = getEl('edit-error');
  try {
    DB.updateRecord(editRecordId, {
      studentName: getEl('edit-name').value.trim(),
      registerNo:  getEl('edit-regno').value.trim().toUpperCase(),
      department:  getEl('edit-dept').value,
      year:        getEl('edit-year').value,
      date:        getEl('edit-date').value,
      computerId:  getEl('edit-computer').value,
      startTime:   getEl('edit-start').value,
      endTime:     getEl('edit-end').value,
    }, currentAdmin);
    getEl('modal-edit').classList.add('hidden');
    toast('Record updated successfully.', 'success');
    renderRecords();
  } catch(e) {
    err.textContent = e.message === 'TIME_CONFLICT' ? 'Time conflict with another record.' : e.message;
    err.style.display = 'block';
  }
});

/* ── Delete Record ── */
function openDeleteRecord(id) {
  deleteRecordId = id;
  getEl('modal-delete').classList.remove('hidden');
}
getEl('btn-del-cancel').addEventListener('click', () => getEl('modal-delete').classList.add('hidden'));
getEl('btn-del-confirm').addEventListener('click', () => {
  if (!deleteRecordId) return;
  DB.deleteRecord(deleteRecordId, currentAdmin);
  getEl('modal-delete').classList.add('hidden');
  toast('Record deleted.', 'warning');
  renderRecords();
  deleteRecordId = null;
});

/* ══════════════════════════════════════════════════════════
   STUDENTS
══════════════════════════════════════════════════════════ */
function loadStudents() {
  getEl('stu-detail').style.display = 'none';
  document.querySelector('#page-students > .mini-stats').style.display = 'flex';
  document.querySelector('#page-students > .filter-bar').style.display = 'flex';
  getEl('student-list').style.display = 'block';

  renderStudentStats();
  renderStudents();
}

function renderStudentStats() {
  const students = DB.getStudents();
  const settings = DB.getSettings();
  const records  = DB.getRecords();
  const depts    = [...new Set(students.map(s=>s.department))].length;

  getEl('student-mini-stats').innerHTML = `
    <div class="mini-stat">
      <div class="mini-stat-label">Total Students</div>
      <div class="mini-stat-value">${students.length}</div>
      <div class="mini-stat-sub">Registered students</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-label">Departments</div>
      <div class="mini-stat-value">${depts}</div>
      <div class="mini-stat-sub">Active departments</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-label">Total Records</div>
      <div class="mini-stat-value">${records.length}</div>
      <div class="mini-stat-sub">All time</div>
    </div>`;
}

function renderStudents() {
  const search  = (getEl('stu-search').value || '').toLowerCase();
  const deptF   = getEl('stu-dept-filter').value;
  let students  = DB.getStudents();

  if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || s.registerNo.toLowerCase().includes(search));
  if (deptF && deptF !== 'all') students = students.filter(s => s.department === deptF);

  const list  = getEl('student-list');
  const empty = getEl('stu-empty');

  if (!students.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const grid = document.createElement('div');
  grid.className = 'student-cards';
  students.forEach(s => {
    const records = DB.filterRecords({ registerNo: s.registerNo });
    const totalMin = records.reduce((sum,r)=>sum+(r.durationMin||0),0);
    const h=Math.floor(totalMin/60),m=totalMin%60;
    const totalUsage = h>0?`${h}h ${m}m`:(m>0?`${m}m`:'—');

    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <div class="student-card-header">
        <div class="student-avatar">${s.name[0].toUpperCase()}</div>
        <div>
          <div class="student-name">${esc(s.name)}</div>
          <div class="student-regno">${esc(s.registerNo)}</div>
        </div>
      </div>
      <div class="student-meta">
        <div class="student-meta-item"><label>Dept</label><span>${esc(s.department)}</span></div>
        <div class="student-meta-item"><label>Year</label><span>${esc(s.year)}</span></div>
        <div class="student-meta-item"><label>Records</label><span>${records.length}</span></div>
        <div class="student-meta-item"><label>Total Usage</label><span>${totalUsage}</span></div>
      </div>`;
    card.addEventListener('click', () => showStudentDetail(s.registerNo));
    grid.appendChild(card);
  });

  list.innerHTML = '';
  list.appendChild(grid);
}

['stu-search','stu-dept-filter'].forEach(id => getEl(id)?.addEventListener('input', renderStudents));
getEl('stu-dept-filter').addEventListener('change', renderStudents);

function showStudentDetail(registerNo) {
  getEl('student-list').style.display = 'none';
  document.querySelector('#page-students > .mini-stats').style.display = 'none';
  document.querySelector('#page-students > .filter-bar').style.display = 'none';

  const s = DB.getStudentWithStats(registerNo);
  if (!s) return;
  const records = DB.filterRecords({ registerNo });

  getEl('stu-detail').style.display = 'block';
  getEl('stu-detail-avatar').textContent = s.name[0].toUpperCase();
  getEl('stu-detail-name').textContent  = s.name;
  getEl('stu-detail-regno').textContent = s.registerNo;
  getEl('stu-detail-dept-badge').innerHTML = `<span class="badge badge-primary">${esc(s.department)}</span>`;
  getEl('stu-d-records').textContent = s.totalRecords;
  getEl('stu-d-usage').textContent   = s.totalUsage;
  getEl('stu-d-avg').textContent     = s.avgDuration > 0 ? (s.avgDuration >= 60 ? Math.round(s.avgDuration/60)+'h' : s.avgDuration+'m') : '—';
  getEl('stu-d-last').textContent    = s.lastSeen ? DB.formatDatePretty(s.lastSeen) : '—';

  getEl('stu-hist-tbody').innerHTML = records.map(r=>`
    <tr>
      <td>${DB.formatDatePretty(r.date)}</td>
      <td><span class="mono" style="font-size:12px">${esc(r.computerCode)}</span></td>
      <td>${DB.formatHHMM(r.startTime)}</td>
      <td>${DB.formatHHMM(r.endTime)}</td>
      <td><strong>${r.duration}</strong></td>
    </tr>`).join('');
}

getEl('stu-back').addEventListener('click', () => {
  getEl('stu-detail').style.display = 'none';
  loadStudents();
});

/* ══════════════════════════════════════════════════════════
   REPORTS
══════════════════════════════════════════════════════════ */
function loadReports() {
  const today = DB.todayISO();
  getEl('rpt-from').value = today;
  getEl('rpt-to').value   = today;
}

// Report type selection
document.querySelectorAll('.report-type-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.report-type-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
  });
});

getEl('btn-generate-report').addEventListener('click', () => {
  const filters = {
    dateFrom:   getEl('rpt-from').value,
    dateTo:     getEl('rpt-to').value,
    department: getEl('rpt-dept').value,
    year:       getEl('rpt-year').value,
  };
  reportRecords = DB.filterRecords(filters);
  const info = getEl('report-result-info');
  info.textContent = `${reportRecords.length} record${reportRecords.length!==1?'s':''} found.`;
  info.style.display = 'block';
  getEl('report-export-btns').style.display = 'flex';

  // Show table
  getEl('report-table-wrap').style.display = 'block';
  getEl('report-table-title').textContent = `Generated Report — ${reportRecords.length} records`;
  getEl('report-tbody').innerHTML = reportRecords.slice(0,50).map(r=>`
    <tr>
      <td>${DB.formatDatePretty(r.date)}</td>
      <td>${esc(r.studentName)}</td>
      <td><span class="mono" style="font-size:12px;color:#6366f1">${esc(r.registerNo)}</span></td>
      <td>${esc(r.department)}</td>
      <td>${esc(r.year)}</td>
      <td><span class="mono" style="font-size:12px">${esc(r.computerCode)}</span></td>
      <td>${DB.formatHHMM(r.startTime)}</td>
      <td>${DB.formatHHMM(r.endTime)}</td>
      <td><strong>${r.duration}</strong></td>
    </tr>`).join('');
});

getEl('rpt-excel').addEventListener('click',()=> DB.exportExcel(reportRecords));
getEl('rpt-csv').addEventListener('click',  ()=> DB.exportCSV(reportRecords));
getEl('rpt-pdf').addEventListener('click',  ()=> DB.exportPDF(reportRecords));

/* ══════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════ */
function loadAnalytics() {
  const an = DB.getAnalytics(30);
  const records = DB.getRecords();

  getEl('an-avg-dur').textContent     = an.avgDuration;
  getEl('an-most-used').textContent   = an.mostUsed;
  getEl('an-total-records').textContent = records.filter(r => {
    const d = new Date(r.date); const cutoff = Date.now() - 30*86400000;
    return d >= cutoff;
  }).length;

  renderDailyChart(an.dailyCounts);
  renderDeptChart(an.deptBreakdown);
  renderPeakChart(an.peakHours);
  renderCompUtil(an.topComputers);
}

function renderDailyChart(dailyCounts) {
  const entries = Object.entries(dailyCounts);
  const max = Math.max(...entries.map(([,v])=>v), 1);
  const wrap = getEl('daily-chart');
  const w = wrap.clientWidth || 600;
  const h = 100;
  const pts = entries.map(([,v],i) => {
    const x = (i / (entries.length-1)) * (w-24) + 12;
    const y = h - (v/max) * (h-16) - 4;
    return `${x},${y}`;
  }).join(' ');

  wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%">
    <defs>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity=".3"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <polygon points="12,${h} ${pts} ${(w-12)},${h}" fill="url(#lineGrad)"/>
    ${entries.map(([d,v],i)=>{
      const x=(i/(entries.length-1))*(w-24)+12;
      const y=h-(v/max)*(h-16)-4;
      return v>0?`<circle cx="${x}" cy="${y}" r="3" fill="#6366f1"/>`:''
    }).join('')}
  </svg>`;
}

function renderDeptChart(deptMap) {
  const colors = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
  const entries = Object.entries(deptMap).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s,[,v])=>s+v,0) || 1;

  // Build SVG donut
  let startAngle = -Math.PI/2;
  const cx=70, cy=70, r=55, ir=35;
  let paths='';
  entries.forEach(([dept,val],i) => {
    const angle = (val/total)*2*Math.PI;
    const x1=cx+r*Math.cos(startAngle), y1=cy+r*Math.sin(startAngle);
    const x2=cx+r*Math.cos(startAngle+angle), y2=cy+r*Math.sin(startAngle+angle);
    const ix1=cx+ir*Math.cos(startAngle), iy1=cy+ir*Math.sin(startAngle);
    const ix2=cx+ir*Math.cos(startAngle+angle), iy2=cy+ir*Math.sin(startAngle+angle);
    const lg = angle > Math.PI ? 1 : 0;
    paths += `<path d="M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${lg} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${lg} 0 ${ix1},${iy1}" fill="${colors[i%colors.length]}" opacity=".9"/>`;
    startAngle += angle;
  });

  const legend = entries.map(([dept,val],i)=>`
    <div class="donut-legend-item">
      <div class="donut-dot" style="background:${colors[i%colors.length]}"></div>
      <div class="donut-dept">${esc(dept)}</div>
      <div class="donut-pct">${Math.round(val/total*100)}%</div>
    </div>`).join('');

  getEl('dept-chart').innerHTML = `
    <div class="donut-wrap">
      <svg class="donut-svg" viewBox="0 0 140 140">
        ${paths}
        <circle cx="${cx}" cy="${cy}" r="${ir-2}" fill="var(--surface)"/>
        <text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)">${total}</text>
        <text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="9" fill="var(--text3)">Records</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

function renderPeakChart(hourMap) {
  const max = Math.max(...Object.values(hourMap), 1);
  const colors = ['#4f46e5','#6366f1','#818cf8','#a5b4fc'];
  const el = getEl('peak-chart');
  el.innerHTML = Object.entries(hourMap).map(([h,v],i) => {
    const pct = Math.round((v/max)*100);
    const hr = parseInt(h);
    const label = `${String(hr).padStart(2,'0')}:00`;
    return `<div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[i%4]}"></div></div>
      <div class="bar-val">${v}</div>
    </div>`;
  }).join('');
}

function renderCompUtil(topComputers) {
  const max = topComputers[0]?.minutes || 1;
  const el = getEl('comp-util-chart');
  el.innerHTML = topComputers.map((c,i) => {
    const pct = Math.round((c.minutes/max)*100);
    const hrs = Math.floor(c.minutes/60), mins = c.minutes%60;
    const label = hrs>0?`${hrs}h ${mins}m`:`${mins}m`;
    return `<div class="bar-row">
      <div class="bar-label">${esc(c.code)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#3b82f6"></div></div>
      <div class="bar-val">${label}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════════ */
function initSettingsForm() {
  const s = DB.getSettings();
  getEl('set-labname').value   = s.labName || '';
  getEl('set-institute').value = s.instituteName || '';
  getEl('set-tz').value        = s.timezone || 'Asia/Kolkata';
  getEl('set-heartbeat').value = s.heartbeatInterval || 30;
  getEl('set-timeout').value   = s.offlineTimeout || 120;
  getEl('set-user').value      = s.adminUser || 'admin';
  renderDeptTags();
}

function renderDeptTags() {
  const s = DB.getSettings();
  const wrap = getEl('dept-tags-wrap');
  wrap.innerHTML = (s.departments||[]).map(d => `
    <span class="dept-tag">${esc(d)}<button class="dept-tag-remove" onclick="removeDept('${esc(d)}')">×</button></span>`
  ).join('');
}

function removeDept(dept) {
  const s = DB.getSettings();
  s.departments = (s.departments||[]).filter(d=>d!==dept);
  DB.saveSettings(s);
  renderDeptTags();
  populateFilters();
}

getEl('btn-add-dept').addEventListener('click', () => {
  const val = getEl('new-dept-input').value.trim();
  if (!val) return;
  const s = DB.getSettings();
  if (!(s.departments||[]).includes(val)) {
    s.departments = [...(s.departments||[]), val];
    DB.saveSettings(s);
    renderDeptTags();
    populateFilters();
  }
  getEl('new-dept-input').value = '';
});

getEl('btn-save-general').addEventListener('click', () => {
  DB.saveSettings({
    labName:       getEl('set-labname').value.trim(),
    instituteName: getEl('set-institute').value.trim(),
    timezone:      getEl('set-tz').value,
  });
  DB.addAuditLog(currentAdmin, 'SETTINGS', 'Updated general settings');
  toast('General settings saved.', 'success');
});

getEl('btn-save-monitoring').addEventListener('click', () => {
  DB.saveSettings({
    heartbeatInterval: parseInt(getEl('set-heartbeat').value),
    offlineTimeout:    parseInt(getEl('set-timeout').value),
  });
  DB.addAuditLog(currentAdmin, 'SETTINGS', 'Updated monitoring configuration');
  toast('Monitoring settings saved.', 'success');
});

getEl('btn-save-creds').addEventListener('click', () => {
  const s = DB.getSettings();
  const curr = getEl('set-curr-pass').value;
  const newP = getEl('set-new-pass').value;
  const conf = getEl('set-conf-pass').value;
  if (curr !== s.adminPass) { toast('Current password incorrect.', 'error'); return; }
  if (!newP) { toast('New password is required.', 'error'); return; }
  if (newP !== conf) { toast('Passwords do not match.', 'error'); return; }
  DB.saveSettings({ adminUser: getEl('set-user').value.trim(), adminPass: newP });
  DB.addAuditLog(currentAdmin, 'SETTINGS', 'Admin credentials updated');
  toast('Credentials updated successfully.', 'success');
  ['set-curr-pass','set-new-pass','set-conf-pass'].forEach(id=>getEl(id).value='');
});

getEl('btn-clear-records').addEventListener('click', () => {
  if (confirm('Delete ALL usage records permanently? This cannot be undone.')) {
    localStorage.removeItem('slm_records');
    localStorage.removeItem('slm_students');
    DB.addAuditLog(currentAdmin, 'DELETE_RECORD', 'Cleared all usage records and students');
    toast('All records cleared.', 'warning');
    if (currentPage === 'records') renderRecords();
    if (currentPage === 'dashboard') loadDashboard();
  }
});

/* ══════════════════════════════════════════════════════════
   AUDIT LOGS
══════════════════════════════════════════════════════════ */
function loadAudit() {
  renderAudit();
}

function renderAudit() {
  const search  = (getEl('audit-search').value || '').toLowerCase();
  const actFilter = getEl('audit-action-filter').value;
  let logs = DB.getAuditLog();
  if (search) logs = logs.filter(l => l.description.toLowerCase().includes(search) || l.admin.toLowerCase().includes(search));
  if (actFilter && actFilter !== 'all') logs = logs.filter(l => l.action === actFilter);

  const tbody = getEl('audit-tbody');
  const empty = getEl('audit-empty');

  if (!logs.length) { tbody.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = logs.slice(0,100).map(l => {
    const d = new Date(l.timestamp);
    const ts = d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false});
    return `<tr>
      <td style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--text3)">${ts}</td>
      <td><strong>${esc(l.admin)}</strong></td>
      <td><span class="audit-action audit-${l.action||''}">${l.action||'—'}</span></td>
      <td style="font-size:13px;color:var(--text2)">${esc(l.description)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text4)">${l.ip||'—'}</td>
    </tr>`;
  }).join('');
}

['audit-search','audit-action-filter'].forEach(id => {
  getEl(id)?.addEventListener('input', renderAudit);
  getEl(id)?.addEventListener('change', renderAudit);
});
getEl('btn-audit-clear').addEventListener('click', () => {
  getEl('audit-search').value='';
  getEl('audit-action-filter').value='all';
  renderAudit();
});

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════════════════ */
function startNotifPolling() {
  updateNotifBadge();
  setInterval(updateNotifBadge, 15000);
}

function updateNotifBadge() {
  const count = DB.getUnreadCount();
  const badge = getEl('notif-count');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

getEl('btn-notif').addEventListener('click', () => {
  const dropdown = getEl('notif-dropdown');
  dropdown.classList.toggle('show');
  if (dropdown.classList.contains('show')) {
    renderNotifs();
    DB.markNotifsRead();
    updateNotifBadge();
  }
});

getEl('notif-clear-btn').addEventListener('click', () => {
  DB.markNotifsRead();
  renderNotifs();
  updateNotifBadge();
});

function renderNotifs() {
  const notifs = DB.getNotifs();
  const list = getEl('notif-list');
  if (!notifs.length) {
    list.innerHTML = `<div style="text-align:center;padding:32px 20px;color:var(--text4)"><div style="font-size:32px;margin-bottom:8px">🔔</div><div style="font-size:13px">You're all caught up!</div></div>`;
    return;
  }
  list.innerHTML = notifs.slice(0,15).map(n => {
    const d = new Date(n.createdAt);
    return `<div class="notif-item${n.read?'':' unread'}">
      <div class="notif-dot" style="background:${n.type==='error'?'#dc2626':n.type==='warning'?'#d97706':'#6366f1'}"></div>
      <div>
        <div class="notif-item-title">${esc(n.title)}</div>
        <div class="notif-item-msg">${esc(n.message)}</div>
        <div class="notif-item-time">${formatRelativeTime(n.createdAt)}</div>
      </div>
    </div>`;
  }).join('');
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!getEl('btn-notif').contains(e.target) && !getEl('notif-dropdown').contains(e.target))
    getEl('notif-dropdown').classList.remove('show');
});

/* ══════════════════════════════════════════════════════════
   HEARTBEAT SIMULATION
══════════════════════════════════════════════════════════ */
function startHeartbeatSimulation() {
  heartbeatTimer = setInterval(() => {
    DB.simulateHeartbeats();
    if (currentPage === 'dashboard') loadDashboard();
    if (currentPage === 'computers' && !detailPcId) renderComputerGrid();
    if (currentPage === 'map') loadLabMap();
    updateNotifBadge();
  }, 30000); // every 30s
}

/* ══════════════════════════════════════════════════════════
   ESCAPE HELPER
══════════════════════════════════════════════════════════ */
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════════
   EDIT-COMPUTER DROPDOWN POPULATE
══════════════════════════════════════════════════════════ */
// Populate edit computer dropdown when modal opens (already done inside openEditRecord)
// Populate edit-dept on open (already done in populateFilters + modal open copies it)

/* ══════════════════════════════════════════════════════════
   MODAL OVERLAY CLICK-TO-CLOSE
══════════════════════════════════════════════════════════ */
['modal-delete','modal-edit','modal-add-comp','modal-view'].forEach(id => {
  getEl(id)?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });
});
