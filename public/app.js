let data = null;
let weekData = [];
let liveStatus = null;

// ─── Init ───
async function init() {
    await loadData();
    render();

    // Live updates from main process
    window.neurafocus.onDataUpdated(async () => {
        await loadData();
        render();
    });
    window.neurafocus.onStateChanged((state) => {
        updateStateUI(state);
    });
    window.neurafocus.onLiveStatus((status) => {
        liveStatus = status;
        renderLiveBar(status);
    });

    // Refresh every 60s even without events
    setInterval(async () => {
        await loadData();
        render();
    }, 60 * 1000);
}

async function loadData() {
    const result = await window.neurafocus.getToday();
    data = result;
    if (result.liveStatus) liveStatus = result.liveStatus;
    weekData = await window.neurafocus.getWeek();
}

// ─── Render all ───
function render() {
    if (!data) return;
    const summary = data.summary || defaultSummary();
    renderScore(summary);
    renderStats(summary);
    renderTopApps(summary);
    renderTimeline(data.sessions || []);
    renderSwitchChart(data.sessions || []);
    renderInsights(summary, data.sessions || []);
    renderWeekChart(weekData);
    updateStateUI(data.appState || {});
}

function defaultSummary() {
    return { focus_time: 0, distraction_time: 0, idle_time: 0, communication_time: 0, focus_score: 0, switch_count: 0, top_apps: '[]' };
}

// ─── Score ring ───
function renderScore(summary) {
    const score = summary.focus_score || 0;
    document.getElementById('scoreNum').textContent = score;
    const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good focus day' : score >= 40 ? 'Moderate' : 'Needs focus';
    document.getElementById('scoreLabel').textContent = label;

    // SVG ring — circumference = 2π×45 ≈ 282.6
    const offset = 282.6 - (score / 100) * 282.6;
    const ring = document.getElementById('scoreRingCircle');
    if (ring) ring.setAttribute('stroke-dashoffset', offset.toFixed(1));
}

// ─── Stats ───
function renderStats(summary) {
    document.getElementById('statFocus').textContent = fmtDuration(summary.focus_time || 0);
    document.getElementById('statDistract').textContent = fmtDuration(summary.distraction_time || 0);
    document.getElementById('statIdle').textContent = fmtDuration(summary.idle_time || 0);
    document.getElementById('statSwitches').textContent = summary.switch_count || 0;
}

// ─── Top apps ───
function renderTopApps(summary) {
    const container = document.getElementById('topApps');
    const apps = JSON.parse(summary.top_apps || '[]');
    const max = apps[0]?.duration || 1;

    if (!apps.length) {
        container.innerHTML = '<div style="color:var(--muted);font-size:12px">No activity yet today.</div>';
        return;
    }

    container.innerHTML = apps.map(a => {
        const pct = Math.round((a.duration / max) * 100);
        const color = getCategoryColor(getCategoryForApp(a.app));
        return `
        <div class="app-row">
            <div class="app-icon" style="background:${color}22;color:${color}">${appEmoji(a.app)}</div>
            <div class="app-info">
                <div class="app-name">${a.app}</div>
                <div class="app-bar-wrap"><div class="app-bar" style="width:${pct}%;background:${color}"></div></div>
            </div>
            <div class="app-time">${fmtDuration(a.duration)}</div>
        </div>`;
    }).join('');
}

// ─── Timeline ───
function renderTimeline(sessions) {
    const container = document.getElementById('timelineBlocks');
    const hoursContainer = document.getElementById('timelineHours');
    if (!container) return;

    const hours = getWorkHours();
    hoursContainer.innerHTML = hours.map(h => `<div class="tl-hour">${fmtHour(h)}</div>`).join('');

    container.innerHTML = hours.map(h => {
        const hourStart = new Date(); hourStart.setHours(h, 0, 0, 0);
        const hourEnd = new Date(); hourEnd.setHours(h + 1, 0, 0, 0);
        const hourMs = 3600000;

        const hourSessions = sessions.filter(s => {
            const ss = s.start, se = s.end;
            return ss < hourEnd.getTime() && se > hourStart.getTime();
        });

        if (!hourSessions.length) {
            const isFuture = hourStart > Date.now();
            return `<div class="tl-row"><div class="tl-block" data-cat="idle" style="width:100%;opacity:${isFuture ? 0.1 : 0.3}"></div></div>`;
        }

        const blocks = hourSessions.map(s => {
            const start = Math.max(s.start, hourStart.getTime());
            const end = Math.min(s.end, hourEnd.getTime());
            const pct = ((end - start) / hourMs * 100).toFixed(1);
            return `<div class="tl-block" data-cat="${s.category}" style="width:${pct}%" title="${s.app}"></div>`;
        }).join('');

        return `<div class="tl-row">${blocks}</div>`;
    }).join('');
}

// ─── Switch chart ───
function renderSwitchChart(sessions) {
    const container = document.getElementById('switchBars');
    const labelsContainer = document.getElementById('switchLabels');
    if (!container) return;

    const hours = getWorkHours();
    const switchesByHour = hours.map(h => {
        const hourStart = new Date(); hourStart.setHours(h, 0, 0, 0);
        const hourEnd = new Date(); hourEnd.setHours(h + 1, 0, 0, 0);
        return sessions.filter(s => s.start >= hourStart.getTime() && s.start < hourEnd.getTime()).length;
    });

    const max = Math.max(...switchesByHour, 1);
    container.innerHTML = switchesByHour.map((c, i) => {
        const pct = Math.round((c / max) * 100);
        const isHigh = c > 15;
        const isFuture = hours[i] > new Date().getHours();
        return `<div class="switch-bar${isHigh ? ' high' : ''}" style="height:${isFuture ? 5 : Math.max(pct, 3)}%;opacity:${isFuture ? 0.15 : 0.7}" title="${c} switches"></div>`;
    }).join('');

    labelsContainer.innerHTML = hours.map((h, i) => {
        const switches = switchesByHour[i];
        const isHigh = switches > 15;
        return `<div class="switch-label" style="${isHigh ? 'color:#ef4444' : ''}">${fmtHour(h)}${isHigh ? ' ⚠' : ''}</div>`;
    }).join('');
}

// ─── Insights ───
function renderInsights(summary, sessions) {
    const container = document.getElementById('insights');
    if (!container) return;
    const insights = [];

    // Best focus hour
    if (sessions.length) {
        const focusByHour = {};
        sessions.filter(s => s.category === 'focus').forEach(s => {
            const h = new Date(s.start).getHours();
            focusByHour[h] = (focusByHour[h] || 0) + s.duration;
        });
        const bestHour = Object.entries(focusByHour).sort((a, b) => b[1] - a[1])[0];
        if (bestHour) insights.push({ icon: '🧠', color: 'var(--accent)', title: `Peak focus: ${fmtHour(+bestHour[0])}`, desc: 'Best deep work window today. Schedule hard tasks here.' });
    }

    // Distraction source
    const distractSessions = sessions.filter(s => s.category === 'distraction');
    if (distractSessions.length) {
        const apps = {};
        distractSessions.forEach(s => { apps[s.app] = (apps[s.app] || 0) + s.duration; });
        const top = Object.entries(apps).sort((a, b) => b[1] - a[1])[0];
        if (top) insights.push({ icon: '🌐', color: 'var(--danger)', title: `${top[0]} is your #1 distraction`, desc: `${fmtDuration(top[1])} on ${top[0]} today.` });
    }

    // High switching
    if (summary.switch_count > 30) {
        insights.push({ icon: '⚡', color: 'var(--warning)', title: 'High context switching', desc: `${summary.switch_count} app switches today — risk of cognitive overload.` });
    }

    // Longest focus run
    const focusRuns = sessions.filter(s => s.category === 'focus').sort((a, b) => b.duration - a.duration);
    if (focusRuns[0]) {
        insights.push({ icon: '✅', color: 'var(--success)', title: `Longest focus run: ${fmtDuration(focusRuns[0].duration)}`, desc: `${focusRuns[0].app} — best deep work block today.` });
    }

    if (!insights.length) {
        container.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">Start working and insights will appear here.</div>';
        return;
    }

    container.innerHTML = insights.map(ins => `
        <div class="insight-card">
            <div class="insight-icon" style="background:${ins.color}18">${ins.icon}</div>
            <div class="insight-text">
                <div class="insight-title">${ins.title}</div>
                <div class="insight-desc">${ins.desc}</div>
            </div>
        </div>`).join('');
}

// ─── Week chart ───
function renderWeekChart(week) {
    const container = document.getElementById('weekChart');
    if (!container || !week.length) return;
    const max = Math.max(...week.map(d => d.focus_score), 1);
    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = week.map(d => {
        const isToday = d.date === today;
        const pct = Math.round((d.focus_score / max) * 100);
        const color = d.focus_score >= 60 ? 'var(--focus-color)' : 'var(--distract-color)';
        const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' });
        return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
            <div style="background:${isToday ? 'var(--accent2)' : color};border-radius:3px;width:100%;height:${Math.max(pct, 5)}%;opacity:${isToday ? 1 : 0.7}"></div>
            <div style="font-size:9px;color:${isToday ? 'var(--accent2)' : 'var(--muted)'};font-weight:${isToday ? 700 : 400}">${isToday ? 'Today' : label}</div>
        </div>`;
    }).join('');
}

// ─── State UI (focus mode / pause toggles) ───
function updateStateUI(state) {
    const toggle = document.getElementById('focusToggle');
    const label = document.getElementById('focusLabel');
    const banner = document.getElementById('focusBanner');
    const pauseBtn = document.getElementById('pauseBtn');

    if (!toggle) return;

    if (state.isFocusMode) {
        toggle.classList.add('active');
        if (label) label.textContent = 'Focusing Now';
        if (banner) banner.style.display = 'flex';
    } else {
        toggle.classList.remove('active');
        if (label) label.textContent = 'Start Focus';
        if (banner) banner.style.display = 'none';
    }

    if (pauseBtn) {
        pauseBtn.textContent = state.isPaused ? '▶ Resume Tracking' : '⏸ Pause Tracking';
    }
}

// ─── Button handlers ───
async function toggleFocus() {
    const state = await window.neurafocus.toggleFocus();
    updateStateUI(state);
}

async function togglePause() {
    const state = await window.neurafocus.togglePause();
    updateStateUI(state);
}

// ─── Helpers ───
function fmtDuration(seconds) {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
}

function fmtHour(h) {
    if (h === 0) return '12am';
    if (h < 12) return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
}

function getWorkHours() {
    const hours = [];
    for (let h = 8; h <= 18; h++) hours.push(h);
    return hours;
}

function getCategoryForApp(appName) {
    const map = { 'VS Code': 'focus', 'Code': 'focus', 'iTerm2': 'focus', 'Terminal': 'focus', 'Xcode': 'focus', 'Slack': 'communication', 'Discord': 'communication', 'Chrome': 'distraction', 'YouTube': 'distraction' };
    return map[appName] || 'focus';
}

function getCategoryColor(cat) {
    const colors = { focus: '#6c63ff', distraction: '#ef4444', communication: '#f59e0b', idle: '#334155' };
    return colors[cat] || '#6c63ff';
}

function appEmoji(name) {
    const emojis = { 'VS Code': '⌨️', 'Code': '⌨️', 'Chrome': '🌐', 'Safari': '🧭', 'Slack': '💬', 'Discord': '💬', 'Telegram': '💬', 'iTerm2': '🖥', 'Terminal': '🖥', 'Figma': '🎨', 'YouTube': '▶️' };
    return emojis[name] || '📱';
}

// ─── Start ───
if (window.neurafocus) {
    init();
} else {
    // Fallback for static preview (static HTML open)
    document.getElementById('focusBanner') && (document.getElementById('focusBanner').style.display = 'flex');
}
