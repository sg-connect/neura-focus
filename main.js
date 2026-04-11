const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, systemPreferences, shell } = require('electron');
const path = require('path');
const db = require('./db');
const tracker = require('./tracker');
const rules = require('./rules');

let tray = null;
let dashboardWin = null;

// ─── State flags ───
let isPaused = false;
let isFocusMode = false;

function getState() {
    return { isPaused, isFocusMode };
}

// ─── Tray icon helpers ───
function getTrayLabel() {
    if (isPaused) return '⊘ Paused';
    const summary = db.getTodaySummary();
    const score = summary ? summary.focus_score : 0;
    return `🧠 ${score}`;
}

function buildTrayMenu() {
    return Menu.buildFromTemplate([
        { label: '📊 Open Dashboard', click: openDashboard },
        { type: 'separator' },
        {
            label: isPaused ? '▶  Resume Tracking' : '⏸  Pause Tracking',
            click: togglePause,
        },
        {
            label: isFocusMode ? '✅ End Focus Mode' : '🎯 Start Focus Mode',
            click: toggleFocusMode,
        },
        { type: 'separator' },
        { label: 'Quit NeuraFocus', click: () => app.quit() },
    ]);
}

function refreshTray() {
    if (!tray) return;
    tray.setTitle(getTrayLabel());
    tray.setContextMenu(buildTrayMenu());
}

// ─── Toggle actions ───
function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        tracker.stop();
        sendNotification('Tracking paused', 'NeuraFocus is no longer recording activity.');
    } else {
        tracker.start(onSessionFlushed);
        sendNotification('Tracking resumed', 'NeuraFocus is watching again.');
    }
    refreshTray();
    if (dashboardWin) dashboardWin.webContents.send('state-changed', getState());
}

function toggleFocusMode() {
    isFocusMode = !isFocusMode;
    rules.setFocusMode(isFocusMode);
    if (isFocusMode) {
        tracker.markFocusStart();
        sendNotification('🎯 Focus mode active', 'Distraction alerts are suppressed. Go build something great.');
    } else {
        tracker.markFocusEnd();
        sendNotification('Focus session ended', 'Nice work. Back to normal tracking.');
    }
    refreshTray();
    if (dashboardWin) dashboardWin.webContents.send('state-changed', getState());
}

// ─── Dashboard window ───
function openDashboard() {
    if (dashboardWin) {
        dashboardWin.focus();
        return;
    }
    dashboardWin = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        title: 'NeuraFocus',
        backgroundColor: '#0d0f14',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    dashboardWin.loadFile(path.join(__dirname, 'public', 'index.html'));
    dashboardWin.webContents.openDevTools({ mode: 'detach' });
    dashboardWin.on('closed', () => { dashboardWin = null; });
}

// ─── Native notification ───
function sendNotification(title, body, actions) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false });
    n.show();
}

// ─── Session callback (called by tracker when session flushed) ───
function onSessionFlushed(session) {
    db.writeSession(session);
    db.rebuildTodaySummary();
    refreshTray();
    if (dashboardWin) dashboardWin.webContents.send('data-updated');

    // Run rules check
    const alert = rules.check(tracker.getState());
    if (alert) sendNotification(alert.title, alert.body);
}

// ─── IPC handlers (called from dashboard via preload) ───
ipcMain.handle('get-today', () => {
    return {
        summary: db.getTodaySummary(),
        sessions: db.getTodaySessions(),
        appState: getState(),
        liveStatus: tracker.getState(),
    };
});

ipcMain.handle('get-week', () => db.getWeekSummaries());

ipcMain.handle('toggle-pause', () => { togglePause(); return getState(); });
ipcMain.handle('toggle-focus', () => { toggleFocusMode(); return getState(); });

ipcMain.handle('mark-focusing', () => {
    if (!isFocusMode) toggleFocusMode();
    return getState();
});

// ─── App lifecycle ───
app.whenReady().then(() => {
    // macOS: don't show in dock, tray only
    if (app.dock) app.dock.hide();

    db.init();

    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('NeuraFocus');
    tray.setTitle('🧠 0');
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', openDashboard);
    tray.on('double-click', openDashboard);

    tracker.start(onSessionFlushed);

    // Push live status to dashboard every 3s
    setInterval(() => {
        if (dashboardWin) {
            dashboardWin.webContents.send('live-status', tracker.getState());
        }
    }, 3000);

    // Rules check every 30s independently
    setInterval(() => {
        if (isPaused) return;
        const alert = rules.check(tracker.getState());
        if (alert) sendNotification(alert.title, alert.body);
    }, 30 * 1000);

    refreshTray();
    sendNotification('NeuraFocus started', 'Tracking your focus in the background.');
});

app.on('window-all-closed', () => {
    // Don't quit on window close — keep running in tray
});

app.on('before-quit', () => {
    tracker.stop();
});
