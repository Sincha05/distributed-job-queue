// Distributed Job Queue System - Frontend Controller

const state = {
  jobs: [],
  stats: {
    total: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead_letter: 0,
  },
  filter: 'ALL',
  autoRefresh: true,
  refreshInterval: null,
  isSubmitting: false,
};

// Presets data
const PRESETS = {
  email: {
    type: 'email',
    priority: 5,
    delay: 0,
    maxAttempts: 5,
    payload: {
      to: 'user@example.com',
      subject: 'Order Confirmation #8492',
      body: 'Thank you for your order! It is now being processed.',
    },
  },
  data: {
    type: 'data-processing',
    priority: 10,
    delay: 0,
    maxAttempts: 5,
    payload: {
      datasetId: 'dataset-finance-q3',
      operation: 'reconcile-transactions',
      recordCount: 15400,
    },
  },
  webhook: {
    type: 'webhook',
    priority: 5,
    delay: 0,
    maxAttempts: 5,
    payload: {
      url: 'https://webhook.site/simulate',
      event: 'user.subscribed',
      timestamp: new Date().toISOString(),
    },
  },
  delayed: {
    type: 'email',
    priority: 5,
    delay: 8000,
    maxAttempts: 5,
    payload: {
      to: 'delayed-user@example.com',
      subject: 'Scheduled Follow-up (8s Delay)',
      body: 'This job sat in delayed queue for 8 seconds before processing.',
    },
  },
  fail: {
    type: 'fail',
    priority: 1,
    delay: 0,
    maxAttempts: 3,
    payload: {
      shouldFail: true,
      errorMessage: 'Simulated 3rd party API 503 Service Unavailable',
    },
  },
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadPreset('email');
  fetchStats();
  fetchJobs();
  startAutoRefresh();
});

function setupEventListeners() {
  // Preset chips
  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const presetKey = chip.dataset.preset;
      if (PRESETS[presetKey]) {
        loadPreset(presetKey);
      }
    });
  });

  // Idempotency key generator
  document.getElementById('gen-idempotency-btn').addEventListener('click', () => {
    const randomKey = 'key-' + Math.random().toString(36).substring(2, 10);
    document.getElementById('job-idempotency').value = randomKey;
    showToast('Generated Idempotency Key: ' + randomKey);
  });

  // Submit job form
  document.getElementById('job-form').addEventListener('submit', handleJobSubmit);

  // Idempotency test runner
  document.getElementById('test-idempotency-btn').addEventListener('click', runIdempotencyTest);

  // Status filters
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.status;
      renderJobs();
    });
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    fetchStats();
    fetchJobs();
    showToast('Dashboard refreshed');
  });

  // Auto refresh toggle
  const toggle = document.getElementById('auto-refresh-toggle');
  toggle.addEventListener('change', (e) => {
    state.autoRefresh = e.target.checked;
    if (state.autoRefresh) {
      startAutoRefresh();
      showToast('Live polling enabled (2.5s)');
    } else {
      stopAutoRefresh();
      showToast('Live polling paused');
    }
  });

  // Modal close
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

function loadPreset(key) {
  const p = PRESETS[key];
  if (!p) return;

  document.getElementById('job-type').value = p.type;
  document.getElementById('job-priority').value = p.priority;
  document.getElementById('job-delay').value = p.delay;
  document.getElementById('job-max-attempts').value = p.maxAttempts;
  document.getElementById('job-payload').value = JSON.stringify(p.payload, null, 2);
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshInterval = setInterval(() => {
    if (!state.isSubmitting) {
      fetchStats(true);
      fetchJobs(true);
    }
  }, 2500);
}

function stopAutoRefresh() {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
    state.refreshInterval = null;
  }
}

// Fetch Stats
async function fetchStats(isSilent = false) {
  try {
    const res = await fetch('/jobs/stats');
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();
    state.stats = data;
    updateStatsUI();
    setSystemStatus(true);
  } catch (err) {
    setSystemStatus(false);
    if (!isSilent) showToast('Failed to connect to backend', 'error');
  }
}

function updateStatsUI() {
  document.getElementById('stat-total').textContent = state.stats.total ?? 0;
  document.getElementById('stat-queued').textContent = state.stats.queued ?? 0;
  document.getElementById('stat-processing').textContent = state.stats.processing ?? 0;
  document.getElementById('stat-completed').textContent = state.stats.completed ?? 0;
  document.getElementById('stat-failed').textContent = state.stats.failed ?? 0;
  document.getElementById('stat-dead-letter').textContent = state.stats.dead_letter ?? 0;
}

function setSystemStatus(isOnline) {
  const dot = document.getElementById('system-status-dot');
  const text = document.getElementById('system-status-text');
  if (isOnline) {
    dot.className = 'status-dot';
    text.textContent = 'API Online';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Offline / Connecting';
  }
}

// Fetch Jobs
async function fetchJobs(isSilent = false) {
  try {
    const res = await fetch('/jobs?limit=50');
    if (!res.ok) throw new Error('Failed to load jobs');
    const data = await res.json();
    state.jobs = data;
    renderJobs();
  } catch (err) {
    if (!isSilent) showToast('Error loading jobs list', 'error');
  }
}

// Render Jobs Table
function renderJobs() {
  const tbody = document.getElementById('jobs-table-body');
  const countSpan = document.getElementById('jobs-count');

  let filtered = state.jobs;
  if (state.filter !== 'ALL') {
    filtered = state.jobs.filter((j) => j.status === state.filter);
  }

  countSpan.textContent = `Showing ${filtered.length} jobs`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          No jobs found with status "${state.filter}". Submit a job using the panel on the left!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((job) => {
      const statusBadge = getStatusBadge(job.status);
      const priorityText = getPriorityText(job.priority);
      const attemptsText = `${job.attempts || 0} / ${job.maxAttempts || 10}`;
      const timeFormatted = formatTime(job.createdAt);

      return `
      <tr>
        <td>${statusBadge}</td>
        <td>
          <span class="code-cell" onclick="openJobModal('${job.id}')" title="Click to inspect job">
            ${job.id.substring(0, 8)}...
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </span>
        </td>
        <td><strong>${escapeHtml(job.type)}</strong></td>
        <td><span style="color: ${getPriorityColor(job.priority)}">${priorityText}</span></td>
        <td>${attemptsText}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${timeFormatted}</td>
      </tr>
    `;
    })
    .join('');
}

function getStatusBadge(status) {
  switch (status) {
    case 'QUEUED':
      return `<span class="badge badge-queued">● Queued</span>`;
    case 'PROCESSING':
      return `<span class="badge badge-processing"><span class="status-dot pulse" style="width:6px;height:6px;background:#3b82f6;"></span> Processing</span>`;
    case 'COMPLETED':
      return `<span class="badge badge-completed">✓ Completed</span>`;
    case 'FAILED':
      return `<span class="badge badge-failed">↻ Retrying</span>`;
    case 'DEAD_LETTER':
      return `<span class="badge badge-dead-letter">✕ Dead Letter</span>`;
    default:
      return `<span class="badge">${status}</span>`;
  }
}

function getPriorityText(priority) {
  if (priority >= 20) return 'Critical (20)';
  if (priority >= 10) return 'High (10)';
  if (priority >= 5) return 'Normal (5)';
  return 'Low (1)';
}

function getPriorityColor(priority) {
  if (priority >= 20) return '#ef4444';
  if (priority >= 10) return '#f59e0b';
  if (priority >= 5) return '#9ca3af';
  return '#6b7280';
}

function formatTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Handle Job Submission
async function handleJobSubmit(e) {
  e.preventDefault();

  const type = document.getElementById('job-type').value.trim();
  const priority = parseInt(document.getElementById('job-priority').value, 10);
  const delay = parseInt(document.getElementById('job-delay').value, 10) || 0;
  const maxAttempts = parseInt(document.getElementById('job-max-attempts').value, 10) || 10;
  const idempotencyKey = document.getElementById('job-idempotency').value.trim();
  const payloadRaw = document.getElementById('job-payload').value.trim();

  let payload = {};
  try {
    payload = payloadRaw ? JSON.parse(payloadRaw) : {};
  } catch (err) {
    showToast('Invalid JSON in payload field', 'error');
    return;
  }

  const submitBtn = document.getElementById('submit-job-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enqueuing...';
  state.isSubmitting = true;

  try {
    const body = {
      type,
      payload,
      priority,
      delay: delay > 0 ? delay : undefined,
      maxAttempts,
      idempotencyKey: idempotencyKey || undefined,
    };

    const res = await fetch('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || 'Failed to submit job');
    }

    const createdJob = await res.json();
    showToast(`Job ${createdJob.id.substring(0, 8)}... created!`);

    // Reset idempotency input if used
    if (idempotencyKey) {
      document.getElementById('job-idempotency').value = '';
    }

    // Refresh immediately
    await fetchStats();
    await fetchJobs();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enqueue Job';
    state.isSubmitting = false;
  }
}

// Run Idempotency Demonstration
async function runIdempotencyTest() {
  const testKey = 'idem-demo-' + Math.floor(Math.random() * 1000000);
  const testBtn = document.getElementById('test-idempotency-btn');
  testBtn.disabled = true;
  testBtn.textContent = 'Testing Idempotency...';

  try {
    showToast(`Request 1: Submitting with key "${testKey}"...`);

    const payload = {
      type: 'email',
      payload: { to: 'idempotent@test.com', message: 'First attempt' },
      idempotencyKey: testKey,
    };

    // First request
    const res1 = await fetch('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const job1 = await res1.json();

    // Second request with exact same key
    showToast(`Request 2: Submitting identical key "${testKey}"...`);
    const res2 = await fetch('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const job2 = await res2.json();

    await fetchStats();
    await fetchJobs();

    // Verify
    if (job1.id === job2.id) {
      alert(
        `✓ IDEMPOTENCY TEST PASSED!\n\nBoth requests used idempotency key:\n"${testKey}"\n\nRequest 1 returned Job ID: ${job1.id}\nRequest 2 returned Job ID: ${job2.id}\n\nPostgreSQL enforced unique constraint: Exactly ONE job was created in the queue!`
      );
    } else {
      alert(`✗ Idempotency mismatch! ${job1.id} vs ${job2.id}`);
    }
  } catch (err) {
    showToast('Idempotency test failed: ' + err.message, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '⚡ Test Idempotency (2x Submit)';
  }
}

// Modal Inspect
async function openJobModal(jobId) {
  const modal = document.getElementById('job-modal');
  const backdrop = document.getElementById('modal-backdrop');

  document.getElementById('modal-job-id').textContent = jobId;
  document.getElementById('modal-job-type').textContent = 'Loading...';
  document.getElementById('modal-job-status').textContent = 'Loading...';
  document.getElementById('modal-job-priority').textContent = '-';
  document.getElementById('modal-job-attempts').textContent = '-';
  document.getElementById('modal-job-created').textContent = '-';
  document.getElementById('modal-job-processed').textContent = '-';
  document.getElementById('modal-job-completed').textContent = '-';
  document.getElementById('modal-job-error-box').style.display = 'none';
  document.getElementById('modal-job-payload').textContent = '{}';

  backdrop.classList.add('open');

  try {
    const res = await fetch(`/jobs/${jobId}`);
    if (!res.ok) throw new Error('Job details not found');
    const job = await res.json();

    document.getElementById('modal-job-id').textContent = job.id;
    document.getElementById('modal-job-type').textContent = job.type;
    document.getElementById('modal-job-status').innerHTML = getStatusBadge(job.status);
    document.getElementById('modal-job-priority').textContent = getPriorityText(job.priority);
    document.getElementById('modal-job-attempts').textContent = `${job.attempts} / ${job.maxAttempts}`;
    document.getElementById('modal-job-created').textContent = job.createdAt ? new Date(job.createdAt).toLocaleString() : '-';
    document.getElementById('modal-job-processed').textContent = job.processedAt ? new Date(job.processedAt).toLocaleString() : '-';
    document.getElementById('modal-job-completed').textContent = job.completedAt ? new Date(job.completedAt).toLocaleString() : '-';

    if (job.error) {
      const errBox = document.getElementById('modal-job-error-box');
      errBox.style.display = 'block';
      document.getElementById('modal-job-error-text').textContent = job.error;
    }

    document.getElementById('modal-job-payload').textContent = JSON.stringify(job.payload || {}, null, 2);
  } catch (err) {
    showToast('Failed to load job details', 'error');
  }
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
