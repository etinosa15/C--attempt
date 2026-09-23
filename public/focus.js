import { dayKey, freshFocusTimer } from "./core.js";

// Persist an accounting timestamp with the countdown. A transaction can credit
// only time after that timestamp, even when several tabs check the same session.
export function advanceFocus(state, action = "tick", now = Date.now()) {
  if (!["tick", "start", "pause", "reset"].includes(action)) throw new Error("Unknown focus action.");
  const next = {
    ...state,
    focusTimer: { ...state.focusTimer },
    focusByDay: { ...state.focusByDay },
    activity: { ...state.activity },
  };
  const timer = next.focusTimer;
  let completed = false;
  const day = dayKey(new Date(now));
  const beforeToday = next.focusByDay[day] || 0;
  if (timer.accountedAt !== null && now >= timer.accountedAt) {
    const used = Math.min(timer.remainingMs, now - timer.accountedAt);
    let cursor = timer.accountedAt;
    const end = cursor + used;
    while (cursor < end) {
      const date = new Date(cursor);
      const key = dayKey(date);
      date.setHours(24, 0, 0, 0);
      const boundary = Math.min(end, date.getTime());
      if (!(next.focusByDay[key] > 0)) next.activity[key] = (next.activity[key] || 0) + 1;
      next.focusByDay[key] = Math.round((next.focusByDay[key] || 0) * 1000 + boundary - cursor) / 1000;
      cursor = boundary;
    }
    next.focusSeconds = Math.round(next.focusSeconds * 1000 + used) / 1000;
    timer.remainingMs -= used;
    timer.accountedAt += used;
    if (timer.remainingMs === 0) {
      timer.accountedAt = null;
      completed = true;
    }
  }
  if (action === "start" && timer.accountedAt === null) {
    if (timer.remainingMs === 0) timer.remainingMs = freshFocusTimer().remainingMs;
    timer.accountedAt = now;
  } else if (action === "pause") timer.accountedAt = null;
  else if (action === "reset") next.focusTimer = freshFocusTimer();
  return {
    state: next,
    completed,
    goalReached: beforeToday < next.goal * 60 && (next.focusByDay[day] || 0) >= next.goal * 60,
  };
}

export function dailyFocus(state, now = Date.now()) {
  const projected = advanceFocus(state, "tick", now).state;
  const day = dayKey(new Date(now));
  const seconds = projected.focusByDay[day] || 0;
  const goalSeconds = projected.goal * 60;
  return {
    day, seconds, goalSeconds,
    remainingSeconds: Math.max(0, goalSeconds - seconds),
    percent: Math.min(100, seconds / goalSeconds * 100),
    achieved: seconds >= goalSeconds,
    running: projected.focusTimer.accountedAt !== null,
    remaining: Math.ceil(projected.focusTimer.remainingMs / 1000),
    totalSeconds: projected.focusSeconds,
  };
}
