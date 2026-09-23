import test from "node:test";
import assert from "node:assert/strict";
import { freshState, sanitizeState, dayKey, FOCUS_SESSION_MS } from "../public/core.js";
import { advanceFocus, dailyFocus } from "../public/focus.js";

const start = new Date(2026, 8, 13, 12).getTime();
const day = dayKey(new Date(start));

test("old backups keep lifetime focus without inventing daily history", () => {
  const old = freshState();
  delete old.focusTimer;
  delete old.focusByDay;
  old.focusSeconds = 7200;
  const restored = sanitizeState(old);
  assert.equal(restored.focusSeconds, 7200);
  assert.equal(dailyFocus(restored, start).seconds, 0);
  assert.equal(restored.focusTimer.remainingMs, FOCUS_SESSION_MS);
  assert.equal(restored.focusTimer.accountedAt, null);
});

test("pause, refresh and resume preserve the countdown and exclude paused time", () => {
  let state = advanceFocus(freshState(), "start", start).state;
  state = advanceFocus(state, "pause", start + 61250).state;
  assert.equal(state.focusByDay[day], 61.25);
  assert.equal(state.focusSeconds, 61.25);
  const restored = sanitizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(dailyFocus(restored, start + 3600000).remaining, 1439);
  state = advanceFocus(restored, "start", start + 3600000).state;
  state = advanceFocus(state, "pause", start + 3610000).state;
  assert.equal(state.focusByDay[day], 71.25);
  assert.equal(state.focusTimer.remainingMs, FOCUS_SESSION_MS - 71250);
});

test("a running timer survives refresh and credits only the remaining session while closed", () => {
  const initial = advanceFocus(freshState(), "start", start).state;
  const checkpoint = advanceFocus(initial, "tick", start + 60000).state;
  const reloaded = sanitizeState(JSON.parse(JSON.stringify(checkpoint)));
  assert.equal(dailyFocus(reloaded, start + 90000).remaining, 1410);
  const finish = advanceFocus(reloaded, "tick", start + 86400000);
  assert.equal(finish.state.focusSeconds, 1500);
  assert.equal(finish.state.focusByDay[day], 1500);
  assert.equal(finish.state.focusTimer.remainingMs, 0);
  assert.equal(finish.state.focusTimer.accountedAt, null);
  assert.equal(finish.completed, true);
  assert.equal(advanceFocus(finish.state, "tick", start + 90000000).completed, false);
});

test("sessions crossing midnight split their seconds between local dates", () => {
  const midnightStart = new Date(2026, 8, 13, 23, 59, 50).getTime();
  const running = advanceFocus(freshState(), "start", midnightStart).state;
  const state = advanceFocus(running, "pause", midnightStart + 30000).state;
  assert.equal(state.focusByDay["2026-09-13"], 10);
  assert.equal(state.focusByDay["2026-09-14"], 20);
  assert.equal(state.focusSeconds, 30);
  assert.equal(dailyFocus(state, midnightStart + 30000).seconds, 20);
  assert.equal(dailyFocus(state, new Date(2026, 8, 15).getTime()).seconds, 0);
  assert.equal(state.activity["2026-09-13"], 1);
  assert.equal(state.activity["2026-09-14"], 1);
});

test("daily goals accumulate sessions, announce crossing once and retain extra time", () => {
  let state = freshState();
  state.goal = 15;
  state = advanceFocus(state, "start", start).state;
  const reached = advanceFocus(state, "tick", start + 900000);
  assert.equal(reached.goalReached, true);
  const done = advanceFocus(reached.state, "tick", start + 1500000);
  assert.equal(done.goalReached, false);
  assert.equal(dailyFocus(done.state, start + 1500000).percent, 100);
  assert.equal(dailyFocus(done.state, start + 1500000).seconds, 1500);
  state = advanceFocus(done.state, "start", start + 1600000).state;
  state = advanceFocus(state, "pause", start + 1660000).state;
  assert.equal(state.focusByDay[day], 1560);
  state.goal = 30;
  assert.equal(dailyFocus(state, start + 1660000).remainingSeconds, 240);
  assert.equal(dailyFocus(state, start + 1660000).achieved, false);
  assert.equal(state.activity[day], 1);
});

test("reset pauses a full timer without deleting time already practiced", () => {
  const running = advanceFocus(freshState(), "start", start).state;
  const reset = advanceFocus(running, "reset", start + 5000).state;
  assert.equal(reset.focusTimer.remainingMs, FOCUS_SESSION_MS);
  assert.equal(reset.focusTimer.accountedAt, null);
  assert.equal(reset.focusByDay[day], 5);
});

test("clock rollback never subtracts time or credits the same interval twice", () => {
  let state = advanceFocus(freshState(), "start", start).state;
  state = advanceFocus(state, "tick", start + 10000).state;
  state = advanceFocus(state, "tick", start + 5000).state;
  assert.equal(state.focusSeconds, 10);
  state = advanceFocus(state, "tick", start + 15000).state;
  assert.equal(state.focusSeconds, 15);
});

test("invalid imported timer fields are paused or replaced with safe defaults", () => {
  const state = freshState();
  state.focusTimer = { remainingMs: -1, accountedAt: start };
  state.focusByDay = { "2026-09-13": 60, "2026-09-14": -10, bad: 12 };
  const result = sanitizeState(state);
  assert.deepEqual(result.focusTimer, freshState().focusTimer);
  assert.deepEqual(result.focusByDay, { "2026-09-13": 60 });
  state.focusTimer = { remainingMs: 1500, accountedAt: "yesterday" };
  assert.equal(sanitizeState(state).focusTimer.accountedAt, null);
});

test("daylight-saving clock changes credit elapsed time on the correct local date", () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    for (const time of [new Date(2026, 2, 8, 1, 55), new Date(2026, 10, 1, 1, 55)]) {
      const now = time.getTime();
      const running = advanceFocus(freshState(), "start", now).state;
      const done = advanceFocus(running, "tick", now + 1500000).state;
      assert.equal(done.focusByDay[dayKey(time)], 1500);
      assert.equal(done.focusSeconds, 1500);
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
