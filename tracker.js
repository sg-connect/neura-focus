const { exec } = require('child_process');

// App category map — drives focus/distraction logic
const APP_CATEGORIES = {
    // Focus
    'Code': 'focus',
    'Visual Studio Code': 'focus',
    'Xcode': 'focus',
    'iTerm2': 'focus',
    'iTerm': 'focus',
    'Terminal': 'focus',
    'Cursor': 'focus',
    'WebStorm': 'focus',
    'IntelliJ IDEA': 'focus',
    'Figma': 'focus',
    'Sketch': 'focus',

    // Communication
    'Slack': 'communication',
    'Microsoft Teams': 'communication',
    'Mail': 'communication',
    'Spark': 'communication',
    'Mimestream': 'communication',
    'Zoom': 'communication',
    'FaceTime': 'communication',
    'Messages': 'communication',
    'Telegram': 'communication',
    'Discord': 'communication',
    'WhatsApp': 'communication',

    // Distraction
    'YouTube': 'distraction',
};

// Window title host patterns for browser categorization
const DISTRACTION_HOSTS = ['youtube.com', 'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'reddit.com', 'tiktok.com', 'twitch.tv', 'netflix.com'];
const FOCUS_HOSTS = ['github.com', 'stackoverflow.com', 'localhost', 'docs.', 'mdn', 'npmjs.com', 'linear.app', 'jira'];

const BROWSERS = ['Google Chrome', 'Chrome', 'Safari', 'Firefox', 'Arc', 'Brave Browser', 'Opera'];
const IDLE_APPS = ['loginwindow', 'Finder', 'SystemPreferencesApp', 'System Preferences', 'System Settings'];

function categorize(appName, windowTitle) {
    if (!appName) return 'idle';
    if (IDLE_APPS.includes(appName)) return 'idle';

    const mapped = APP_CATEGORIES[appName];
    if (mapped) return mapped;

    if (BROWSERS.includes(appName)) {
        const title = (windowTitle || '').toLowerCase();
        if (DISTRACTION_HOSTS.some(h => title.includes(h))) return 'distraction';
        if (FOCUS_HOSTS.some(h => title.includes(h))) return 'focus';
        return 'communication'; // neutral browser usage
    }

    return 'focus'; // default unknown apps to focus
}

// ─── Session aggregator ───
let currentSession = null;
let pollingInterval = null;
let onFlushCallback = null;
let focusStartTime = null;

// State exposed to rules engine
const state = {
    currentApp: null,
    currentCategory: 'idle',
    currentSessionStart: null,
    focusModeActive: false,
    // Rolling window counters (updated on each flush)
    switchesLastHour: 0,
    distractionStreakMs: 0,
    focusStreakMs: 0,
    switchTimestamps: [], // timestamps of app switches in last 60 min
};

function getState() {
    // Add live current session duration to streaks
    if (currentSession) {
        const elapsed = Date.now() - currentSession.start;
        if (currentSession.category === 'distraction') {
            return { ...state, distractionStreakMs: elapsed, focusStreakMs: 0 };
        }
        if (currentSession.category === 'focus') {
            return { ...state, focusStreakMs: elapsed, distractionStreakMs: 0 };
        }
    }
    return { ...state };
}

function flushSession(endTime) {
    if (!currentSession) return;
    const duration = endTime - currentSession.start;
    if (duration < 2000) { currentSession = null; return; } // ignore < 2s blips

    const session = {
        app: currentSession.app,
        windowTitle: currentSession.windowTitle,
        category: currentSession.category,
        start: currentSession.start,
        end: endTime,
        duration: Math.round(duration / 1000), // seconds
    };

    // Update switch tracking
    const now = Date.now();
    state.switchTimestamps = state.switchTimestamps.filter(t => now - t < 60 * 60 * 1000);
    state.switchTimestamps.push(now);
    state.switchesLastHour = state.switchTimestamps.length;

    // Update streak state
    if (session.category === 'distraction') {
        state.distractionStreakMs += duration;
        state.focusStreakMs = 0;
    } else if (session.category === 'focus') {
        state.focusStreakMs += duration;
        state.distractionStreakMs = 0;
    } else {
        // communication / idle resets distraction streak but not focus
        state.distractionStreakMs = 0;
    }

    currentSession = null;
    if (onFlushCallback) onFlushCallback(session);
}

function getActiveApp() {
    return new Promise((resolve) => {
        // Get app name + window title via osascript (runs inside Electron which has Accessibility)
        const script = `
tell application "System Events"
    set frontApp to first process whose frontmost is true
    set appName to name of frontApp
    set winTitle to ""
    try
        set winTitle to name of first window of frontApp
    end try
    return appName & "|||" & winTitle
end tell`;

        const child = exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 2500 }, (err, stdout) => {
            if (err || !stdout) {
                resolve({ app: 'Unknown', windowTitle: '' });
                return;
            }
            const parts = stdout.trim().split('|||');
            resolve({ app: parts[0] || 'Unknown', windowTitle: parts[1] || '' });
        });

        // Safety timeout in case osascript hangs (e.g. no Accessibility permission yet)
        setTimeout(() => {
            child.kill();
            resolve({ app: 'Unknown', windowTitle: '' });
        }, 2400);
    });
}

async function poll() {
    const { app: appName, windowTitle } = await getActiveApp();
    const category = categorize(appName, windowTitle);
    const now = Date.now();

    if (!currentSession) {
        currentSession = { app: appName, windowTitle, category, start: now };
        state.currentApp = appName;
        state.currentCategory = category;
        state.currentSessionStart = now;
        return;
    }

    // Same app — keep accumulating
    if (currentSession.app === appName) {
        // Update window title in case it changed (browser navigation)
        currentSession.windowTitle = windowTitle;
        return;
    }

    // App changed — flush old session, start new
    flushSession(now);
    currentSession = { app: appName, windowTitle, category, start: now };
    state.currentApp = appName;
    state.currentCategory = category;
    state.currentSessionStart = now;
}

function start(flushCallback) {
    onFlushCallback = flushCallback;
    pollingInterval = setInterval(poll, 3000);
    console.log('[tracker] started, polling every 3s');
}

function stop() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    if (currentSession) flushSession(Date.now());
    console.log('[tracker] stopped');
}

function markFocusStart() {
    focusStartTime = Date.now();
    state.focusModeActive = true;
    state.focusStreakMs = 0;
}

function markFocusEnd() {
    state.focusModeActive = false;
    focusStartTime = null;
}

module.exports = { start, stop, getState, markFocusStart, markFocusEnd };
