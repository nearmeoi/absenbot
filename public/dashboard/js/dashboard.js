/**
 * Dashboard JavaScript - SPA Edition
 * Handles routing, API calls, and dynamic content rendering without page reload
 */

// ==========================================
// 1. ROUTER & NAVIGATION
// ==========================================

const routes = {
    '/dashboard': { title: 'Overview', render: renderOverview },
    '/dashboard/': { title: 'Overview', render: renderOverview },
    '/dashboard/users': { title: 'User Management', render: renderUsers },
    '/dashboard/groups': { title: 'Active Groups', render: renderActiveGroups },
    '/dashboard/scheduler': { title: 'Scheduler Control', render: renderScheduler },
    '/dashboard/settings': { title: 'Settings', render: renderSettings },
    '/dashboard/development': { title: 'Development', render: renderDevelopment },
    '/dashboard/terminal': { title: 'Terminal', render: renderTerminal }
};

document.addEventListener('DOMContentLoaded', () => {
    // Initial Render
    handleRoute(window.location.pathname);

    // Feather Icons Init
    if (typeof feather !== 'undefined') feather.replace();
    initSidebar();

    // Intercept Links for SPA Navigation
    document.body.addEventListener('click', e => {
        const link = e.target.closest('a[data-link]');
        if (link) {
            e.preventDefault();
            navigateTo(link.getAttribute('href'));
        }
    });

    // Handle Back/Forward Browser Buttons
    window.addEventListener('popstate', () => {
        handleRoute(window.location.pathname);
    });
});

function navigateTo(url) {
    history.pushState(null, null, url);
    handleRoute(url);
}

function handleRoute(path) {
    // Normalize path (remove trailing slash for matching)
    const cleanPath = path.endsWith('/') && path !== '/dashboard/' ? path.slice(0, -1) : path;
    const route = routes[cleanPath] || routes['/dashboard'];

    // Update Title
    document.title = `${route.title} - AbsenBot Dashboard`;

    // Update Active Nav State
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.remove('active');
        if (el.getAttribute('href') === cleanPath) {
            el.classList.add('active');
        }
    });

    // Render Content
    const appContent = document.getElementById('app-content');
    if (appContent) {
        // Show loading state
        appContent.innerHTML = '<div style="display:flex; justify-content:center; padding:3rem;"><div class="spinner"></div></div>';

        // Render View
        route.render(appContent);

        // Update Page Title in Topbar
        const titleEl = document.querySelector('.page-title');
        if (titleEl) titleEl.textContent = route.title;

        // Re-init Icons
        if (typeof feather !== 'undefined') setTimeout(feather.replace, 100);
    }
}


// ==========================================
// 2. VIEW RENDERERS
// ==========================================

function renderOverview(container) {
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-label">Total Users</span>
                <div class="stat-value" id="totalUsers">-</div>
                <div class="stat-meta"><span class="badge badge-neutral">Registered</span></div>
            </div>
            <div class="stat-card">
                <span class="stat-label">Attendance Today</span>
                <div class="stat-value" id="absenToday">-</div>
                <div class="stat-meta"><span class="badge badge-success">Done</span></div>
            </div>
            <div class="stat-card">
                <span class="stat-label">Pending</span>
                <div class="stat-value" id="pendingToday">-</div>
                <div class="stat-meta"><span class="badge badge-warning">Waiting</span></div>
            </div>
            <div class="stat-card">
                <span class="stat-label">Bot Status</span>
                <div id="botStatusBadge" style="margin-top:0.5rem"><span class="badge badge-neutral">Checking...</span></div>
            </div>
        </div>
        
        <div class="card" style="margin-bottom:1.5rem">
            <div class="card-header"><h4 class="card-title">Bot Control</h4></div>
            <div class="card-body">
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem">
                    Control bot status. <strong>Offline</strong> = bot ignores all messages. <strong>Maintenance</strong> = bot replies with maintenance message.
                </p>
                <div id="botStatusButtons" style="display:flex; gap:0.5rem; flex-wrap:wrap">
                    <button class="btn btn-success" onclick="setBotStatus('online')">
                        <i data-feather="check-circle" style="width:16px; margin-right:8px"></i> Online
                    </button>
                    <button class="btn btn-warning" onclick="setBotStatus('maintenance')">
                        <i data-feather="tool" style="width:16px; margin-right:8px"></i> Maintenance
                    </button>
                    <button class="btn btn-danger" onclick="setBotStatus('offline')">
                        <i data-feather="power" style="width:16px; margin-right:8px"></i> Offline
                    </button>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h4 class="card-title">Recent Activity</h4>
                <div style="display:flex; gap:0.5rem">
                    <span class="badge badge-neutral">Real-time</span>
                    <button class="btn btn-secondary btn-sm" onclick="loadLogs()">
                        <i data-feather="refresh-cw" style="width:12px"></i>
                    </button>
                </div>
            </div>
            <div class="card-body" style="padding: 0">
                <div id="activityLogs">Loading logs...</div>
            </div>
        </div>
    `;
    loadStats();
    loadLogs();
}

function renderUsers(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h4 class="card-title">Registered Users</h4>
                <div style="display:flex; gap:0.5rem">
                    <button class="btn btn-secondary btn-sm" onclick="batchCheckAll()">
                        <i data-feather="play-circle" style="width:14px"></i> Check All Status
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="loadUsers()">
                        <i data-feather="refresh-cw" style="width:14px"></i> Refresh
                    </button>
                </div>
            </div>
            <div class="card-body" style="padding: 0">
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr><th>Email</th><th>Phone</th><th>Registered</th><th>Actions</th></tr>
                        </thead>
                        <tbody id="usersTable">
                            <tr><td colspan="4" class="text-center p-4">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    loadUsers();
}

function renderScheduler(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header"><h4 class="card-title">Global Control</h4></div>
            <div class="card-body">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="schedulerToggle" onchange="toggleScheduler()">
                        <span class="toggle-slider"></span>
                    </label>
                    <div>
                        <h5 style="font-size: 0.875rem; font-weight: 600;">System Scheduler</h5>
                        <p style="font-size: 0.75rem; color: var(--text-muted)">Toggle all automated tasks.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-header"><h4 class="card-title">Active Schedules (WITA)</h4></div>
            <div class="card-body" style="padding: 0">
                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Time</th><th>Description</th><th>Action</th></tr></thead>
                        <tbody id="scheduleList"><tr><td colspan="3" class="text-center p-4">Loading...</td></tr></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    loadScheduler();
}

function renderSettings(container) {
    container.innerHTML = `
        <div style="max-width: 500px;">
            <div class="card">
                <div class="card-header"><h4 class="card-title">Custom Holidays</h4></div>
                <div class="card-body">
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem">
                        Add dates when the scheduler should NOT send reminders (e.g. public holidays, company events).
                    </p>
                    <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem;">
                        <input type="date" id="holidayDate" class="form-input" style="flex: 1;">
                        <button class="btn btn-primary" onclick="addHoliday()"><i data-feather="plus"></i> Add</button>
                    </div>
                    <div id="holidaysList" style="display: flex; flex-direction: column; gap: 0.5rem;"></div>
                </div>
            </div>
        </div>
    `;
    loadHolidays();
}

function renderDevelopment(container) {
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <div class="card">
                <div class="card-header"><h4 class="card-title">Test Triggers</h4></div>
                <div class="card-body">
                    <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Trigger events immediately. Only affects groups with <strong>Testing</strong> enabled.
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <button class="btn btn-secondary" onclick="triggerTest('morning')">
                            <i data-feather="sun" style="width:16px; margin-right:8px"></i> Test Morning Reminder
                        </button>
                        <button class="btn btn-secondary" onclick="triggerTest('afternoon')">
                            <i data-feather="home" style="width:16px; margin-right:8px"></i> Test Afternoon (Markipul)
                        </button>
                        <button class="btn btn-secondary" onclick="triggerTest('evening')">
                            <i data-feather="moon" style="width:16px; margin-right:8px"></i> Test Evening Reminder
                        </button>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h4 class="card-title">Message Templates (v7.1)</h4></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Select Template</label>
                        <select id="msgTemplateSelect" class="form-input" onchange="loadMessageContent()">
                            <optgroup label="Sceduler Reminders">
                                <option value="morning_reminder">Morning Reminder</option>
                                <option value="afternoon_reminder">Afternoon Reminder (Markipul)</option>
                                <option value="evening_reminder">Evening Reminder</option>
                            </optgroup>
                            <optgroup label="General & Menu">
                                <option value="menu">Main Menu (!menu)</option>
                                <option value="help">Help / Panduan (!help)</option>
                                <option value="holiday_message">Holiday Response</option>
                                <option value="maintenance_message">Maintenance Mode Response</option>
                                <option value="voicenote_disabled">Voice Note Disabled</option>
                            </optgroup>
                            <optgroup label="Registration">
                                <option value="not_registered">Not Registered Alert</option>
                                <option value="already_registered">Already Registered Alert</option>
                                <option value="registration_link_group">Reg Link (Group)</option>
                                <option value="registration_link_private">Reg Link (Private)</option>
                                <option value="registration_success">Registration Success</option>
                                <option value="registration_failed">Registration Failed</option>
                            </optgroup>
                            <optgroup label="Absen Process">
                                <option value="absen_loading">Loading / Processing</option>
                                <option value="absen_failed_auto">AutoGen Failed</option>
                                <option value="absen_processing_ai">AI Processing</option>
                                <option value="absen_failed_ai">AI Error</option>
                                <option value="absen_too_short">Rejection: Too Short</option>
                            </optgroup>
                            <optgroup label="Drafts & Confirmation">
                                <option value="draft_preview">Draft Preview (First)</option>
                                <option value="draft_updated">Draft Updated (Revision)</option>
                                <option value="draft_update_loading">Revision Loading</option>
                                <option value="draft_update_failed">Revision Failed</option>
                                <option value="draft_manual_updated">Manual Edit Success</option>
                                <option value="draft_format_error">Manual Edit Format Error</option>
                                <option value="draft_alert">Late Night Draft Alert</option>
                                <option value="submit_success">Submission Success</option>
                                <option value="submit_failed">Submission Failed</option>
                                <option value="emergency_submit">Emergency Auto-Submit</option>
                            </optgroup>
                            <optgroup label="Check & History">
                                <option value="cek_sudah_absen">Check: Already Done</option>
                                <option value="cek_belum_absen">Check: Not Done</option>
                                <option value="cek_error">Check: Error</option>
                                <option value="riwayat_header">History Header</option>
                                <option value="riwayat_no_data">History No Data</option>
                                <option value="riwayat_failed">History Failed</option>
                                <option value="riwayat_sent_to_private">History Sent to PM</option>
                                <option value="siapa_header">Who Haven't Absen Header</option>
                                <option value="siapa_all_done">Who Haven't Absen (All Done)</option>
                            </optgroup>
                            <optgroup label="Admin & Group">
                                <option value="setgroup_not_group">SetGroup: Not Group</option>
                                <option value="setgroup_success">SetGroup: Success</option>
                                <option value="hapus_not_found">Delete User: Not Found</option>
                                <option value="hapus_success">Delete User: Success</option>
                                <option value="hapus_failed">Delete User: Failed</option>
                                <option value="listuser_empty">List User: Empty</option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Content</label>
                        <textarea id="msgContent" class="form-input" rows="6" style="font-family: monospace; font-size: 0.85rem;"></textarea>
                    </div>
                    <button class="btn btn-primary" style="width: 100%" onclick="saveMessageContent()">
                        <i data-feather="save" style="width:16px; margin-right:8px"></i> Save Template
                    </button>
                </div>
            </div>
        </div>
    `;
    loadMessageContent(); // Initial load
}

async function triggerTest(type) {
    if (!confirm(`Run TEST for ${type}? Only 'Testing' groups will receive this.`)) return;

    const res = await api('/dashboard/api/test/trigger', {
        method: 'POST',
        body: JSON.stringify({ type })
    });

    if (res && res.success) {
        toast(`Test sent to ${res.count} groups`, 'success');
    } else {
        toast(res.message || 'Test failed', 'error');
    }
}

let loadedMessages = {};
async function loadMessageContent() {
    // Reload all messages if needed, or check cache logic
    // For simplicity, just fetch all again
    const messages = await api('/dashboard/api/messages');
    if (!messages) return;

    loadedMessages = messages;
    const key = document.getElementById('msgTemplateSelect').value;
    document.getElementById('msgContent').value = loadedMessages[key] || '';
}

async function saveMessageContent() {
    const key = document.getElementById('msgTemplateSelect').value;
    const content = document.getElementById('msgContent').value;

    const res = await api('/dashboard/api/messages', {
        method: 'POST',
        body: JSON.stringify({ key, content })
    });

    if (res && res.success) {
        toast('Template saved', 'success');
        loadedMessages[key] = content;
    } else {
        toast('Failed to save', 'error');
    }
}

let terminalAutoRefresh = null;

function renderTerminal(container) {
    container.innerHTML = `
        <div class="terminal-container" style="
            background: #1a1a2e;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
            <div class="terminal-header" style="
                background: #16213e;
                padding: 0.75rem 1rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #0f3460;
            ">
                <div style="display:flex; align-items:center; gap:0.5rem">
                    <div style="display:flex; gap:6px">
                        <span style="width:12px; height:12px; border-radius:50%; background:#ff5f56"></span>
                        <span style="width:12px; height:12px; border-radius:50%; background:#ffbd2e"></span>
                        <span style="width:12px; height:12px; border-radius:50%; background:#27ca40"></span>
                    </div>
                    <span style="color:#8892b0; font-size:0.85rem; margin-left:0.5rem">Bot Activity Log</span>
                </div>
                <div style="display:flex; gap:0.5rem">
                    <button class="btn btn-sm" id="terminalAutoBtn" onclick="toggleTerminalAuto()" 
                        style="background:#0f3460; color:#64ffda; border:1px solid #0f3460; font-size:0.75rem">
                        <i data-feather="play" style="width:12px"></i> Auto
                    </button>
                    <button class="btn btn-sm" onclick="refreshTerminal()" 
                        style="background:#0f3460; color:#8892b0; border:1px solid #0f3460; font-size:0.75rem">
                        <i data-feather="refresh-cw" style="width:12px"></i> Refresh
                    </button>
                    <button class="btn btn-sm" onclick="clearTerminal()" 
                        style="background:#0f3460; color:#8892b0; border:1px solid #0f3460; font-size:0.75rem">
                        <i data-feather="trash-2" style="width:12px"></i> Clear
                    </button>
                </div>
            </div>
            <div id="terminalOutput" style="
                height: calc(100vh - 200px);
                min-height: 400px;
                overflow-y: auto;
                padding: 1rem;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 0.85rem;
                line-height: 1.6;
                color: #ccd6f6;
            ">
                <div style="color:#64ffda">$ Loading logs...</div>
            </div>
        </div>
    `;
    refreshTerminal();
    // Start auto-refresh
    startTerminalAuto();
}

async function refreshTerminal() {
    const logs = await api('/dashboard/api/logs?limit=100');
    const output = document.getElementById('terminalOutput');
    if (!output) return;

    if (!logs || logs.length === 0) {
        output.innerHTML = '<div style="color:#64ffda">$ No logs yet...</div>';
        return;
    }

    // Format logs with colors based on type
    const typeColors = {
        'SUCCESS': '#27ca40',
        'ERROR': '#ff5f56',
        'WARNING': '#ffbd2e',
        'INFO': '#64ffda',
        'DEFAULT': '#8892b0'
    };

    output.innerHTML = logs.reverse().map(l => {
        const time = new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const date = new Date(l.timestamp).toLocaleDateString('id-ID');
        const color = typeColors[l.type] || typeColors.DEFAULT;
        const typeLabel = l.type ? `[${l.type}]` : '';

        return `<div style="margin-bottom:0.25rem">
            <span style="color:#495670">${date} ${time}</span>
            <span style="color:${color}; font-weight:600"> ${typeLabel}</span>
            <span style="color:#ccd6f6"> ${l.message}</span>
        </div>`;
    }).join('');

    // Scroll to bottom
    output.scrollTop = output.scrollHeight;
}

function startTerminalAuto() {
    if (terminalAutoRefresh) clearInterval(terminalAutoRefresh);
    terminalAutoRefresh = setInterval(refreshTerminal, 3000);
    updateAutoBtn(true);
}

function stopTerminalAuto() {
    if (terminalAutoRefresh) {
        clearInterval(terminalAutoRefresh);
        terminalAutoRefresh = null;
    }
    updateAutoBtn(false);
}

function toggleTerminalAuto() {
    if (terminalAutoRefresh) {
        stopTerminalAuto();
    } else {
        startTerminalAuto();
    }
}

function updateAutoBtn(isRunning) {
    const btn = document.getElementById('terminalAutoBtn');
    if (btn) {
        btn.innerHTML = isRunning
            ? '<i data-feather="pause" style="width:12px"></i> Auto'
            : '<i data-feather="play" style="width:12px"></i> Auto';
        btn.style.color = isRunning ? '#27ca40' : '#64ffda';
        feather.replace();
    }
}

function clearTerminal() {
    const output = document.getElementById('terminalOutput');
    if (output) {
        output.innerHTML = '<div style="color:#64ffda">$ Terminal cleared</div>';
    }
}

function renderActiveGroups(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h4 class="card-title">All Participating Groups</h4>
                <button class="btn btn-primary btn-sm" onclick="loadActiveGroups()">
                    <i data-feather="refresh-cw" style="width:14px"></i> Refresh
                </button>
            </div>
            <div class="card-body" style="padding: 0">
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Group Name</th>
                                <th>Members</th>
                                <th>Created</th>
                                <th>Type</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="activeGroupsTable">
                            <tr><td colspan="5" class="text-center p-4">Loading groups from WhatsApp...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    loadActiveGroups();
}


// ==========================================
// 3. API & LOGIC (Reused)
// ==========================================

async function api(endpoint, options = {}) {
    try {
        const res = await fetch(endpoint, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        if (res.status === 401) {
            window.location.href = '/dashboard/login';
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return null;
    }
}

function timeAgo(date) {
    const min = Math.floor((new Date() - new Date(date)) / 60000);
    return min < 1 ? 'Just now' : min < 60 ? `${min}m ago` : min < 1440 ? `${Math.floor(min / 60)}h ago` : `${Math.floor(min / 1440)}d ago`;
}

function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    t.style.cssText = `position:fixed; bottom:24px; right:24px; padding:1rem 1.5rem; background:var(--bg-surface); color:var(--text-main); border-left:4px solid var(--${type === 'error' ? 'danger' : 'success'}); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:9999; animation:slideIn 0.3s ease;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// Data Loaders
async function loadStats() {
    const data = await api('/dashboard/api/stats');
    if (!data) return;
    document.getElementById('totalUsers').textContent = data.users.total;
    document.getElementById('absenToday').textContent = data.users.absenToday;
    document.getElementById('pendingToday').textContent = data.users.pendingToday;

    // Show bot status badge with correct color
    const statusBadge = document.getElementById('botStatusBadge');
    if (statusBadge) {
        const status = data.bot.status || 'online';
        const badgeColors = {
            online: 'badge-success',
            maintenance: 'badge-warning',
            offline: 'badge-danger'
        };
        const statusLabels = {
            online: 'Online',
            maintenance: 'Maintenance',
            offline: 'Offline'
        };
        statusBadge.innerHTML = `<span class="badge ${badgeColors[status]}">${statusLabels[status]}</span>`;
    }
}

async function setBotStatus(status) {
    const res = await api('/dashboard/api/bot/status', {
        method: 'POST',
        body: JSON.stringify({ status })
    });

    if (res && res.success) {
        toast(`Bot status: ${status.toUpperCase()}`, status === 'online' ? 'success' : 'error');
        loadStats(); // Refresh to show new status
    } else {
        toast('Failed to update status', 'error');
    }
}

async function loadLogs() {
    const logs = await api('/dashboard/api/logs?limit=20');
    if (!logs) return;
    const container = document.getElementById('activityLogs');
    container.innerHTML = logs.length ? logs.map(l => `
        <div class="log-item">
            <div class="log-content">
                <h4 style="font-size:0.875rem">${l.message}</h4>
                <div class="log-time">${timeAgo(l.timestamp)}</div>
            </div>
        </div>
    `).join('') : '<div style="padding:1rem; text-align:center; color:var(--text-muted)">No activity</div>';
}

async function loadUsers() {
    const users = await api('/dashboard/api/users');
    if (!users) return;
    document.getElementById('usersTable').innerHTML = users.map(u => `
        <tr>
            <td>${u.email}</td>
            <td>${u.phone}</td>
            <td>${new Date(u.registeredAt).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteUser('${encodeURIComponent(u.phone)}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function deleteUser(phone) {
    if (!confirm('Are you sure?')) return;
    const res = await api(`/dashboard/api/users/${phone}`, { method: 'DELETE' });
    if (res && res.success) {
        toast('User deleted', 'success');
        loadUsers();
    } else {
        toast('Failed to delete', 'error');
    }
}

async function loadScheduler() {
    const data = await api('/dashboard/api/scheduler');
    if (!data) return;
    const toggle = document.getElementById('schedulerToggle');
    if (toggle) toggle.checked = data.enabled;

    document.getElementById('scheduleList').innerHTML = data.schedules.map(s => `
        <tr>
            <td><span class="badge badge-neutral">${s.time}</span></td>
            <td>${s.name}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="triggerSchedule('${s.type}')">Run Now</button>
            </td>
        </tr>
    `).join('');
}

async function toggleScheduler() {
    const res = await api('/dashboard/api/scheduler/toggle', { method: 'POST' });
    if (res) toast(`Scheduler ${res.enabled ? 'Enabled' : 'Disabled'}`, 'success');
}

async function triggerSchedule(type) {
    if (!confirm('Run this task immediately?')) return;
    const res = await api(`/dashboard/api/scheduler/trigger/${type}`, { method: 'POST' });
    if (res && res.success) toast('Task triggered successfully', 'success');
    else toast('Failed to trigger task', 'error');
}

async function loadHolidays() {
    const holidays = await api('/dashboard/api/holidays');
    document.getElementById('holidaysList').innerHTML = holidays.map(h => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem; background:var(--bg-body); border-radius:6px;">
            <span>${h}</span>
            <button class="btn btn-danger btn-sm" onclick="removeHoliday('${h}')"><i data-feather="trash-2" style="width:14px"></i></button>
        </div>
    `).join('');
    feather.replace();
}

async function addHoliday() {
    const date = document.getElementById('holidayDate').value;
    if (!date) return toast('Select date first', 'error');
    await api('/dashboard/api/holidays', {
        method: 'POST', body: JSON.stringify({ date })
    });
    loadHolidays();
    toast('Holiday added', 'success');
}

async function removeHoliday(date) {
    if (!confirm('Remove holiday?')) return;
    await api(`/dashboard/api/holidays/${date}`, { method: 'DELETE' });
    loadHolidays();
    toast('Holiday removed', 'success');
}

async function batchCheckAll() {
    if (!confirm('Start checking attendance for ALL users? This might take a while.')) return;
    const res = await api('/dashboard/api/users/check-all', { method: 'POST' });
    if (res && res.success) {
        toast('Batch check started in background', 'info');
        // Redirect to logs to watch progress
        // navigateTo('/dashboard'); 
        // Or just load logs here if we were on a page that showed them.
    }
}

async function loadGroups() {
    const groups = await api('/dashboard/api/groups');
    if (!groups) return;

    // Groups is now an object: { "id": { name: "", schedulerEnabled: true } }
    const list = Object.entries(groups).map(([id, settings]) => {
        return `
        <div style="background:var(--bg-body); border-radius:8px; padding:1rem; border:1px solid var(--border)">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem">
                <div>
                    <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.25rem">
                        ${settings.name || 'Unnamed Group'}
                    </div>
                    <div style="font-family:monospace; font-size:0.75rem; color:var(--text-muted)">
                        ${id}
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="removeGroup('${encodeURIComponent(id)}')">
                    <i data-feather="trash-2" style="width:14px"></i>
                </button>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem">
                <input type="text" class="form-input" placeholder="Group Name" value="${settings.name || ''}" 
                    onchange="updateGroupSettings('${id}', {name: this.value})"
                    style="font-size:0.8rem; padding:0.4rem; grid-column: span 2">
                    
                <label class="btn btn-secondary btn-sm" style="justify-content:center; ${settings.schedulerEnabled ? 'background:var(--primary-light); color:var(--primary); border-color:var(--primary)' : ''}">
                    <input type="checkbox" style="display:none" 
                        ${settings.schedulerEnabled ? 'checked' : ''}
                        onchange="updateGroupSettings('${id}', {schedulerEnabled: this.checked})">
                    <i data-feather="${settings.schedulerEnabled ? 'check-circle' : 'circle'}" style="width:14px"></i>
                    Scheduler
                </label>

                <label class="btn btn-secondary btn-sm" style="justify-content:center; ${settings.isTesting ? 'background:#fef3c7; color:#d97706; border-color:#d97706' : ''}">
                    <input type="checkbox" style="display:none" 
                        ${settings.isTesting ? 'checked' : ''}
                        onchange="updateGroupSettings('${id}', {isTesting: this.checked})">
                    <i data-feather="${settings.isTesting ? 'check-square' : 'square'}" style="width:14px"></i>
                    Testing
                </label>
            </div>
        </div>
        `;
    }).join('');

    document.getElementById('groupsList').innerHTML = list || '<div style="text-align:center; color:var(--text-muted); padding:1rem">No allowed groups</div>';
    feather.replace();
}

async function updateGroupSettings(groupId, updates) {
    await api('/dashboard/api/groups', {
        method: 'POST',
        body: JSON.stringify({ groupId, ...updates })
    });
    toast('Settings updated', 'success');
    // Don't reload whole list to keep focus, but maybe refresh visual state if needed
    // For simplicity, we assume the UI updates (input value / checkbox) reflect the state or we reload:
    loadGroups();
}

async function addGroup() {
    const id = document.getElementById('groupId').value;
    if (!id) return toast('Enter Group ID', 'error');
    await api('/dashboard/api/groups', {
        method: 'POST', body: JSON.stringify({ groupId: id, name: 'New Group' })
    });
    loadGroups();
    toast('Group added', 'success');
}

async function removeGroup(id) {
    if (!confirm('Remove group?')) return;
    await api(`/dashboard/api/groups/${id}`, { method: 'DELETE' });
    loadGroups();
    toast('Group removed', 'success');
}

async function loadActiveGroups() {
    // Fetch both active groups AND current whitelist settings
    const [groups, settings] = await Promise.all([
        api('/dashboard/api/groups/active'),
        api('/dashboard/api/groups')
    ]);

    if (!groups) {
        document.getElementById('activeGroupsTable').innerHTML = '<tr><td colspan="5" class="text-center p-4">Bot offline or error fetching groups</td></tr>';
        return;
    }

    if (groups.length === 0) {
        document.getElementById('activeGroupsTable').innerHTML = '<tr><td colspan="5" class="text-center p-4">No groups found</td></tr>';
        return;
    }

    // Store data globally for modal
    window.activeGroups = groups;
    window.groupSettings = settings || {};

    document.getElementById('activeGroupsTable').innerHTML = groups.map(g => {
        const isWhitelisted = settings && settings[g.id];
        const config = isWhitelisted ? settings[g.id] : null;

        // Build status badges
        let statusBadges = '';
        if (isWhitelisted) {
            statusBadges += '<span class="badge badge-success" style="margin-right:4px">Whitelisted</span>';
            if (config.schedulerEnabled) statusBadges += '<span class="badge badge-primary" style="margin-right:4px">Scheduler</span>';
            if (config.isTesting) statusBadges += '<span class="badge badge-warning">Testing</span>';
        } else {
            statusBadges = '<span class="badge badge-neutral">Not configured</span>';
        }

        return `
        <tr style="cursor:pointer" onclick="openGroupModal('${g.id}')">
            <td>
                <div style="font-weight:600">${g.name}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); font-family:monospace">${g.id.substring(0, 20)}...</div>
            </td>
            <td><span class="badge badge-neutral">${g.participantCount}</span></td>
            <td style="font-size:0.85rem">${g.creation}</td>
            <td>
                ${g.isAnnounce ? '<span class="badge badge-warning">Announce</span>' : '<span class="badge badge-success">Open</span>'}
            </td>
            <td>${statusBadges}</td>
        </tr>
        `;
    }).join('');
    feather.replace();
}

// Modal Functions
function openGroupModal(groupId) {
    const group = window.activeGroups.find(g => g.id === groupId);
    if (!group) return;

    const settings = window.groupSettings[groupId];
    const isWhitelisted = !!settings;

    document.getElementById('modalGroupName').textContent = group.name;

    let html = `
        <div class="modal-info-row">
            <span class="modal-info-label">Group ID</span>
            <span class="modal-info-value" style="font-family:monospace; font-size:0.75rem">${groupId}</span>
        </div>
        <div class="modal-info-row">
            <span class="modal-info-label">Members</span>
            <span class="modal-info-value">${group.participantCount} participants</span>
        </div>
        <div class="modal-info-row">
            <span class="modal-info-label">Created</span>
            <span class="modal-info-value">${group.creation}</span>
        </div>
        <div class="modal-info-row">
            <span class="modal-info-label">Type</span>
            <span class="modal-info-value">${group.isAnnounce ? 'Announcement Only' : 'Open Group'}</span>
        </div>
    `;

    if (isWhitelisted) {
        html += `
        <div class="modal-section">
            <div class="modal-section-title">Settings</div>
            
            <div class="modal-toggle-row">
                <div class="modal-toggle-info">
                    <h4>Scheduler</h4>
                    <p>Receive automated reminders (morning, afternoon, evening)</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${settings.schedulerEnabled ? 'checked' : ''} 
                        onchange="updateModalSetting('${groupId}', 'schedulerEnabled', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="modal-toggle-row">
                <div class="modal-toggle-info">
                    <h4>Testing Mode</h4>
                    <p>Use this group for testing from Development menu</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${settings.isTesting ? 'checked' : ''} 
                        onchange="updateModalSetting('${groupId}', 'isTesting', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="modal-toggle-row">
                <div class="modal-toggle-info">
                    <h4>Skip Weekends</h4>
                    <p>Don't send reminders on Saturday & Sunday</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${settings.skipWeekends !== false ? 'checked' : ''} 
                        onchange="updateModalSetting('${groupId}', 'skipWeekends', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        
        <div class="modal-section">
            <div class="modal-section-title">Group Holidays</div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem">
                On these dates, scheduler will NOT send reminders to this group.
            </p>
            <div style="display:flex; gap:0.5rem; margin-bottom:1rem">
                <input type="date" id="groupHolidayDate" class="form-input" style="flex:1">
                <button class="btn btn-primary btn-sm" onclick="addGroupHoliday('${groupId}')">
                    <i data-feather="plus" style="width:14px"></i> Add
                </button>
            </div>
            <div id="groupHolidaysList" style="display:flex; flex-wrap:wrap; gap:0.5rem">
                ${(settings.holidays || []).map(h => `
                    <span class="badge badge-neutral" style="display:flex; align-items:center; gap:0.5rem">
                        ${h}
                        <button onclick="removeGroupHoliday('${groupId}', '${h}')" 
                            style="background:none; border:none; cursor:pointer; padding:0; color:var(--text-muted)">
                            <i data-feather="x" style="width:12px"></i>
                        </button>
                    </span>
                `).join('') || '<span style="color:var(--text-muted); font-size:0.85rem">No holidays set</span>'}
            </div>
        </div>
        
        <div class="modal-actions">
            <button class="btn btn-danger" onclick="removeFromWhitelist('${groupId}')">
                <i data-feather="trash-2" style="width:16px; margin-right:8px"></i> Remove from Whitelist
            </button>
        </div>
        `;
    } else {
        html += `
        <div class="modal-section" style="text-align:center; padding:2rem 0">
            <p style="color:var(--text-muted); margin-bottom:1rem">This group is not in your whitelist yet.</p>
            <button class="btn btn-primary" onclick="addToWhitelist('${groupId}', '${group.name.replace(/'/g, "\\'")}')">
                <i data-feather="plus-circle" style="width:16px; margin-right:8px"></i> Add to Whitelist
            </button>
        </div>
        `;
    }

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('groupModal').style.display = 'flex';
    feather.replace();
}

function closeGroupModal() {
    document.getElementById('groupModal').style.display = 'none';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.id === 'groupModal') {
        closeGroupModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeGroupModal();
    }
});

async function updateModalSetting(groupId, key, value) {
    const updates = {};
    updates[key] = value;
    await api('/dashboard/api/groups', {
        method: 'POST',
        body: JSON.stringify({ groupId, ...updates })
    });

    // Update local state
    if (window.groupSettings[groupId]) {
        window.groupSettings[groupId][key] = value;
    }

    toast('Setting updated', 'success');
    loadActiveGroups(); // Refresh table in background
}

async function addToWhitelist(groupId, name) {
    await api('/dashboard/api/groups', {
        method: 'POST',
        body: JSON.stringify({ groupId, name })
    });
    toast(`${name} added to whitelist`, 'success');
    closeGroupModal();
    loadActiveGroups();
}

async function removeFromWhitelist(groupId) {
    if (!confirm('Remove this group from whitelist?')) return;
    await api(`/dashboard/api/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
    toast('Group removed from whitelist', 'success');
    closeGroupModal();
    loadActiveGroups();
}

async function addGroupHoliday(groupId) {
    const dateInput = document.getElementById('groupHolidayDate');
    const date = dateInput.value;
    if (!date) return toast('Please select a date', 'error');

    const settings = window.groupSettings[groupId];
    const holidays = settings.holidays || [];

    if (holidays.includes(date)) {
        return toast('Date already added', 'error');
    }

    holidays.push(date);
    holidays.sort();

    await api('/dashboard/api/groups', {
        method: 'POST',
        body: JSON.stringify({ groupId, holidays })
    });

    window.groupSettings[groupId].holidays = holidays;
    toast('Holiday added', 'success');
    openGroupModal(groupId); // Refresh modal
    loadActiveGroups();
}

async function removeGroupHoliday(groupId, date) {
    const settings = window.groupSettings[groupId];
    const holidays = (settings.holidays || []).filter(h => h !== date);

    await api('/dashboard/api/groups', {
        method: 'POST',
        body: JSON.stringify({ groupId, holidays })
    });

    window.groupSettings[groupId].holidays = holidays;
    toast('Holiday removed', 'success');
    openGroupModal(groupId); // Refresh modal
    loadActiveGroups();
}

// UI Helpers
function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (toggle && sidebar && overlay) {
        toggle.onclick = () => {
            sidebar.classList.add('show');
            overlay.classList.add('show');
        };
        overlay.onclick = () => {
            sidebar.classList.remove('show');
            overlay.classList.remove('show');
        };
    }
}
