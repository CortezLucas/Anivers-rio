// ============================================================
//  NARAH CRM — Frontend
//  ⚠️  Configure as duas linhas abaixo após o deploy do Apps Script.
// ============================================================

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxTxRThY6B4ANo8g0Q9Ohx9MUYd5vOpo0fKt3IgVNfLBMdMMiKBfWlexAvotuG3XFnp/exec',
  API_KEY: 'NARAH',
};

// ============================================================
//  Estado da aplicação
// ============================================================

const state = {
  patients:       [],
  history:        [],
  editingPatient: null,   // objeto paciente sendo editado, ou null
  searchQuery:    '',
  currentTab:     'patients',
};

// ============================================================
//  Inicialização
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSearch();
  setupForm();
  checkConfig();
  loadAll();
});

function checkConfig() {
  if (CONFIG.API_URL.includes('SEU_DEPLOYMENT_ID')) {
    document.querySelectorAll('.setup-alert').forEach(el => el.style.display = 'flex');
  }
}

async function loadAll() {
  await Promise.all([loadPatients(), loadHistory()]);
}

// ============================================================
//  Navegação por tabs
// ============================================================

function setupTabs() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tabName)
  );
  document.querySelectorAll('.tab-panel').forEach(panel =>
    panel.classList.toggle('active', panel.id === 'tab-' + tabName)
  );
}

// ============================================================
//  API — comunicação com Apps Script
// ============================================================

async function apiGet(action) {
  const url = `${CONFIG.API_URL}?action=${action}&key=${encodeURIComponent(CONFIG.API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(payload) {
  const res = await fetch(CONFIG.API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify({ ...payload, key: CONFIG.API_KEY }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ============================================================
//  Pacientes — carregar e renderizar
// ============================================================

async function loadPatients() {
  const container = document.getElementById('patients-list');
  container.innerHTML = loadingHTML('Carregando pacientes…');

  try {
    state.patients = await apiGet('getPatients');
    updateStats();
    renderPatients();
  } catch (err) {
    container.innerHTML = errorHTML('Não foi possível carregar os pacientes.', err.message);
  }
}

function updateStats() {
  const today = getDaysUntilBirthday; // alias
  const todayCount = state.patients.filter(p => getDaysUntilBirthday(p.birthday) === 0).length;
  const weekCount  = state.patients.filter(p => {
    const d = getDaysUntilBirthday(p.birthday);
    return d > 0 && d <= 7;
  }).length;

  setText('stat-total', state.patients.length);
  setText('stat-today', todayCount);
  setText('stat-week',  weekCount);
}

function renderPatients() {
  const q = state.searchQuery.toLowerCase();
  const container = document.getElementById('patients-list');

  const list = state.patients
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .map(p => ({ ...p, daysUntil: getDaysUntilBirthday(p.birthday) }))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        ${q ? 'Nenhum paciente encontrado para "' + escapeHtml(q) + '".' : 'Nenhum paciente cadastrado ainda.'}
      </div>`;
    return;
  }

  container.innerHTML = list.map(p => patientCardHTML(p)).join('');
  bindPatientActions(container);
}

function patientCardHTML(p) {
  const isToday = p.daysUntil === 0;
  const isWeek  = p.daysUntil > 0 && p.daysUntil <= 7;
  const initials = p.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const badge = isToday
    ? '<span class="badge badge-today">🎂 Aniversário hoje!</span>'
    : isWeek
      ? '<span class="badge badge-week">Esta semana</span>'
      : '';

  const countdown = isToday
    ? '<div class="patient-countdown">Parabéns! 🎉 Envie um e-mail agora.</div>'
    : `<div class="patient-countdown">${p.daysUntil} dia${p.daysUntil !== 1 ? 's' : ''} para o próximo aniversário</div>`;

  const sendBtn = (isToday || isWeek)
    ? `<button class="btn btn-secondary btn-sm btn-send-email" data-row="${p.row}" title="Enviar e-mail de aniversário">📧 E-mail</button>`
    : '';

  return `
    <div class="patient-card ${isToday ? 'birthday-today' : isWeek ? 'birthday-week' : ''}"
         data-row="${p.row}">
      <div class="patient-avatar">${escapeHtml(initials)}</div>
      <div class="patient-body">
        <div class="patient-name">
          ${escapeHtml(p.name)} ${badge}
        </div>
        <div class="patient-meta">
          <span>📅 ${escapeHtml(p.birthday)}</span>
          <span>✉️ ${escapeHtml(p.email)}</span>
          ${p.phone ? `<span>📱 ${escapeHtml(p.phone)}</span>` : ''}
        </div>
        ${countdown}
      </div>
      <div class="patient-actions">
        ${sendBtn}
        <button class="btn btn-outline btn-sm btn-edit-patient" data-row="${p.row}">Editar</button>
        <button class="btn btn-ghost btn-sm btn-delete-patient" data-row="${p.row}" title="Excluir paciente">✕</button>
      </div>
    </div>`;
}

function bindPatientActions(container) {
  container.addEventListener('click', async e => {
    const sendBtn   = e.target.closest('.btn-send-email');
    const editBtn   = e.target.closest('.btn-edit-patient');
    const deleteBtn = e.target.closest('.btn-delete-patient');

    if (sendBtn) {
      const patient = findPatient(parseInt(sendBtn.dataset.row));
      if (patient) await handleSendManualEmail(patient, sendBtn);
    }

    if (editBtn) {
      const patient = findPatient(parseInt(editBtn.dataset.row));
      if (patient) openEditForm(patient);
    }

    if (deleteBtn) {
      const patient = findPatient(parseInt(deleteBtn.dataset.row));
      if (patient) confirmDeletePatient(patient);
    }
  });
}

// ============================================================
//  Busca
// ============================================================

function setupSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    state.searchQuery = input.value.trim();
    renderPatients();
  });
}

// ============================================================
//  Formulário — adicionar / editar
// ============================================================

function setupForm() {
  document.getElementById('patient-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', resetForm);
  document.getElementById('btn-new-patient')?.addEventListener('click', () => {
    resetForm();
    switchTab('form');
  });
}

function openEditForm(patient) {
  state.editingPatient = patient;
  setValue('field-name',     patient.name);
  setValue('field-birthday', dateToInput(patient.birthday));
  setValue('field-email',    patient.email);
  setValue('field-phone',    patient.phone);
  setText('form-title-text', 'Editar paciente');
  showEl('btn-cancel-edit');
  switchTab('form');
  document.getElementById('field-name')?.focus();
}

function resetForm() {
  state.editingPatient = null;
  document.getElementById('patient-form').reset();
  setText('form-title-text', 'Novo paciente');
  hideEl('btn-cancel-edit');
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const data = {
    name:     getValue('field-name').trim(),
    birthday: dateToDisplay(getValue('field-birthday')),
    email:    getValue('field-email').trim(),
    phone:    getValue('field-phone').trim(),
  };

  if (!data.name || !data.birthday || !data.email) {
    toast('Preencha nome, aniversário e e-mail.', 'error');
    return;
  }

  const btn = document.querySelector('#patient-form .btn-submit');
  setLoading(btn, true);

  try {
    if (state.editingPatient) {
      await apiPost({ action: 'updatePatient', row: state.editingPatient.row, ...data });
      toast('Paciente atualizado com sucesso!', 'success');
    } else {
      await apiPost({ action: 'addPatient', ...data });
      toast('Paciente adicionado com sucesso!', 'success');
    }
    resetForm();
    switchTab('patients');
    await loadPatients();
  } catch (err) {
    toast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ============================================================
//  Excluir paciente
// ============================================================

function confirmDeletePatient(patient) {
  showModal({
    title: 'Excluir paciente?',
    body:  `Tem certeza que deseja remover <strong>${escapeHtml(patient.name)}</strong> do CRM? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Excluir',
    confirmClass: 'btn-danger',
    onConfirm:    () => deletePatient(patient),
  });
}

async function deletePatient(patient) {
  try {
    await apiPost({ action: 'deletePatient', row: patient.row });
    toast('Paciente removido.', 'info');
    await loadPatients();
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, 'error');
  }
}

// ============================================================
//  Envio manual de e-mail
// ============================================================

async function handleSendManualEmail(patient, btn) {
  setLoading(btn, true, '📧');
  try {
    await apiPost({ action: 'sendManual', name: patient.name, email: patient.email });
    toast(`E-mail enviado para ${patient.name}!`, 'success');
    await loadHistory();
    if (state.currentTab === 'history') renderHistory();
  } catch (err) {
    toast('Erro ao enviar e-mail: ' + err.message, 'error');
  } finally {
    setLoading(btn, false, '📧 E-mail');
  }
}

// ============================================================
//  Histórico — carregar e renderizar
// ============================================================

async function loadHistory() {
  try {
    state.history = await apiGet('getHistory');
    if (state.currentTab === 'history') renderHistory();
  } catch (_) {
    // Histórico é não-crítico
  }
}

function renderHistory() {
  const filterType = document.getElementById('filter-type')?.value || '';
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  const list = filterType
    ? state.history.filter(h => h.type === filterType)
    : state.history;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">Nenhum envio registrado ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(h => `
    <tr>
      <td>${escapeHtml(h.date)}</td>
      <td><strong>${escapeHtml(h.patient)}</strong></td>
      <td><a href="mailto:${escapeHtml(h.email)}" style="color:var(--primary)">${escapeHtml(h.email)}</a></td>
      <td><span class="badge ${h.type === 'Automático' ? 'badge-auto' : 'badge-manual'}">${escapeHtml(h.type)}</span></td>
      <td><span class="badge ${h.status === 'Enviado' ? 'badge-sent' : 'badge-error'}">${escapeHtml(h.status)}</span></td>
    </tr>`).join('');
}

// ============================================================
//  Modal de confirmação
// ============================================================

function showModal({ title, body, confirmLabel, confirmClass, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <p>${body}</p>
      <div class="modal-actions">
        <button class="btn btn-outline" id="modal-cancel">Cancelar</button>
        <button class="btn ${confirmClass || 'btn-primary'}" id="modal-confirm">${confirmLabel || 'Confirmar'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#modal-confirm').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ============================================================
//  Toast notifications
// ============================================================

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${escapeHtml(message)}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ============================================================
//  Utilitários de data
// ============================================================

function getDaysUntilBirthday(birthday) {
  const bday = parseBirthday(birthday);
  if (!bday) return 999;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  // Se é hoje, a diferença é 0
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}

function parseBirthday(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length >= 2) {
    const d = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const y = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
    return new Date(y, m, d);
  }
  const parsed = new Date(str);
  return isNaN(parsed) ? null : parsed;
}

// HTML date input usa YYYY-MM-DD; planilha usa DD/MM/YYYY
function dateToDisplay(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function dateToInput(displayDate) {
  if (!displayDate) return '';
  const parts = displayDate.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// ============================================================
//  Helpers de DOM
// ============================================================

function findPatient(row) {
  return state.patients.find(p => p.row === row) || null;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function getText(id)             { return document.getElementById(id)?.textContent ?? ''; }
function setText(id, val)        { const el = document.getElementById(id); if (el) el.textContent = val; }
function getValue(id)            { return document.getElementById(id)?.value ?? ''; }
function setValue(id, val)       { const el = document.getElementById(id); if (el) el.value = val; }
function showEl(id)              { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hideEl(id)              { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.innerHTML = label ?? btn.dataset.originalText ?? '';
  }
}

function loadingHTML(msg) {
  return `<div class="loading-state"><span class="spinner"></span>${escapeHtml(msg)}</div>`;
}

function errorHTML(msg, detail) {
  return `<div class="empty-state">
    <span class="empty-state-icon">⚠️</span>
    ${escapeHtml(msg)}<br>
    <small style="color:var(--text-muted)">${escapeHtml(detail || '')}</small>
  </div>`;
}

// Vincula o filtro do histórico ao renderizar
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filter-type')?.addEventListener('change', renderHistory);
  document.getElementById('btn-refresh-history')?.addEventListener('click', async () => {
    await loadHistory();
    renderHistory();
    toast('Histórico atualizado.', 'info');
  });
});
