const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const os = require('os');

const DB_PATH = path.join(os.homedir(), '.neura-focus.db');
let db;

function init() {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            window_title TEXT,
            category TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            date TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_summary (
            date TEXT PRIMARY KEY,
            focus_time INTEGER DEFAULT 0,
            distraction_time INTEGER DEFAULT 0,
            idle_time INTEGER DEFAULT 0,
            communication_time INTEGER DEFAULT 0,
            focus_score INTEGER DEFAULT 0,
            switch_count INTEGER DEFAULT 0,
            top_apps TEXT DEFAULT '[]'
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
    `);
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function writeSession(session) {
    const stmt = db.prepare(`
        INSERT INTO sessions (app, window_title, category, start, end, duration, date)
        VALUES (@app, @windowTitle, @category, @start, @end, @duration, @date)
    `);
    stmt.run({
        app: session.app,
        windowTitle: session.windowTitle || null,
        category: session.category,
        start: session.start,
        end: session.end,
        duration: session.duration,
        date: todayStr(),
    });
}

function getTodaySessions() {
    return db.prepare(`
        SELECT * FROM sessions WHERE date = ? ORDER BY start ASC
    `).all(todayStr());
}

function getTodaySummary() {
    return db.prepare(`SELECT * FROM daily_summary WHERE date = ?`).get(todayStr()) || null;
}

function getWeekSummaries() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return db.prepare(`
        SELECT * FROM daily_summary WHERE date >= ? ORDER BY date ASC
    `).all(sevenDaysAgo);
}

function rebuildTodaySummary() {
    const date = todayStr();
    const sessions = getTodaySessions();

    let focusTime = 0, distractionTime = 0, idleTime = 0, commTime = 0;
    const appDurations = {};

    for (const s of sessions) {
        if (s.category === 'focus') focusTime += s.duration;
        else if (s.category === 'distraction') distractionTime += s.duration;
        else if (s.category === 'idle') idleTime += s.duration;
        else if (s.category === 'communication') commTime += s.duration;

        if (s.category !== 'idle') {
            appDurations[s.app] = (appDurations[s.app] || 0) + s.duration;
        }
    }

    const totalActive = focusTime + distractionTime + commTime;
    const focusScore = totalActive > 0
        ? Math.round((focusTime / totalActive) * 100)
        : 0;

    const switchCount = sessions.length;

    const topApps = Object.entries(appDurations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([app, duration]) => ({ app, duration }));

    db.prepare(`
        INSERT INTO daily_summary (date, focus_time, distraction_time, idle_time, communication_time, focus_score, switch_count, top_apps)
        VALUES (@date, @focusTime, @distractionTime, @idleTime, @commTime, @focusScore, @switchCount, @topApps)
        ON CONFLICT(date) DO UPDATE SET
            focus_time = @focusTime,
            distraction_time = @distractionTime,
            idle_time = @idleTime,
            communication_time = @commTime,
            focus_score = @focusScore,
            switch_count = @switchCount,
            top_apps = @topApps
    `).run({
        date,
        focusTime,
        distractionTime,
        idleTime,
        commTime,
        focusScore,
        switchCount,
        topApps: JSON.stringify(topApps),
    });
}

module.exports = { init, writeSession, getTodaySessions, getTodaySummary, getWeekSummaries, rebuildTodaySummary };
