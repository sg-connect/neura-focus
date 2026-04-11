// Rules: each rule has a cooldown to prevent spam
const RULES = [
    {
        id: 'distracted_long',
        check: (s) => s.distractionStreakMs > 20 * 60 * 1000, // 20 min distracted
        title: '⚠️ You\'ve been distracted',
        body: (s) => `${Math.round(s.distractionStreakMs / 60000)} minutes on ${s.currentApp}. Time to refocus?`,
        cooldown: 25 * 60 * 1000,
    },
    {
        id: 'focus_break',
        check: (s) => s.focusStreakMs > 90 * 60 * 1000, // 90 min focus
        title: '🚶 Time to take a walk',
        body: () => 'You\'ve been focusing for 90+ minutes. A short break will restore your energy.',
        cooldown: 60 * 60 * 1000,
    },
    {
        id: 'context_switching',
        check: (s) => s.switchesLastHour > 20,
        title: '🔀 Too much context switching',
        body: (s) => `${s.switchesLastHour} app switches in the last hour. Pick one task and stay with it.`,
        cooldown: 30 * 60 * 1000,
    },
    {
        id: 'great_streak',
        check: (s) => s.focusStreakMs > 60 * 60 * 1000 && s.focusStreakMs < 65 * 60 * 1000,
        title: '🔥 Excellent focus streak!',
        body: (s) => `${Math.round(s.focusStreakMs / 60000)} minutes of deep work. You\'re in the zone.`,
        cooldown: 90 * 60 * 1000,
    },
];

const lastFired = {}; // ruleId → timestamp
let focusModeActive = false;

function setFocusMode(active) {
    focusModeActive = active;
    if (!active) {
        // reset distraction rule cooldown so it can fire again soon after focus mode ends
        delete lastFired['distracted_long'];
    }
}

function check(state) {
    if (focusModeActive) return null; // all alerts suppressed in focus mode

    const now = Date.now();

    for (const rule of RULES) {
        if (!rule.check(state)) continue;

        const last = lastFired[rule.id] || 0;
        if (now - last < rule.cooldown) continue;

        lastFired[rule.id] = now;
        return {
            title: rule.title,
            body: typeof rule.body === 'function' ? rule.body(state) : rule.body,
        };
    }
    return null;
}

module.exports = { check, setFocusMode };
