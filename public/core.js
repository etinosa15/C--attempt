export const STORAGE_KEY = "forge.academy.v1";
export const FOCUS_SESSION_MS = 25 * 60 * 1000;
export const freshFocusTimer = () => ({ remainingMs: FOCUS_SESSION_MS, accountedAt: null });
export const freshState = () => ({
  version: 1,
  completed: [],
  quizzes: {},
  solved: [],
  drafts: {},
  notes: {},
  reviews: {},
  activity: {},
  projectChecks: {},
  hints: {},
  rubrics: {},
  certificates: {},
  certName: "",
  lastLesson: null,
  goal: 30,
  focusSeconds: 0,
  focusByDay: {},
  focusTimer: freshFocusTimer(),
  onboarded: false,
  lastExport: 0,
});
export function validateProgress(raw) {
  // Older exports have no dated focus history or timer, but always contain
  // these progress collections. Reject damaged files before replacing a save.
  if (!raw || raw.version !== 1 ||
      !["completed", "solved"].every(key => Array.isArray(raw[key])) ||
      !["quizzes", "drafts", "notes", "reviews", "activity", "projectChecks"].every(
        key => raw[key] && typeof raw[key] === "object" && !Array.isArray(raw[key]),
      ))
    throw new Error("This progress file is incomplete or damaged. Choose a complete Forge backup.");
  return sanitizeState(raw);
}
export function sanitizeState(raw) {
  const base = freshState();
  if (!raw || typeof raw !== "object" || raw.version !== 1)
    throw new Error("This is not a Forge progress file.");
  for (const key of ["completed", "solved"])
    if (Array.isArray(raw[key]))
      base[key] = [...new Set(raw[key].filter((v) => typeof v === "string"))];
  for (const key of [
    "quizzes",
    "drafts",
    "notes",
    "reviews",
    "activity",
    "projectChecks",
    "hints",
    "rubrics",
    "certificates",
  ])
    if (raw[key] && typeof raw[key] === "object" && !Array.isArray(raw[key]))
      base[key] = Object.fromEntries(
        Object.entries(raw[key]).filter(
          ([k]) => !["__proto__", "constructor", "prototype"].includes(k),
        ),
      );
  for (const key of ["drafts", "notes"])
    base[key] = Object.fromEntries(
      Object.entries(base[key])
        .filter(([, v]) => typeof v === "string"),
    );
  base.quizzes = Object.fromEntries(
    Object.entries(base.quizzes).filter(([, v]) => v === true),
  );
  base.reviews = Object.fromEntries(
    Object.entries(base.reviews).filter(
      ([, v]) =>
        v &&
        typeof v === "object" &&
        Number.isFinite(v.due) &&
        Number.isFinite(v.interval) &&
        Number.isFinite(v.count) &&
        v.interval >= 0 &&
        v.count >= 0,
    ),
  );
  base.activity = Object.fromEntries(
    Object.entries(base.activity).filter(
      ([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v > 0,
    ),
  );
  base.projectChecks = Object.fromEntries(
    Object.entries(base.projectChecks)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [
        k,
        [...new Set(v.filter((n) => Number.isInteger(n) && n >= 0 && n < 6))],
      ]),
  );
  // Progressive hints: how many tiers a lesson has unlocked (integer, capped so a
  // damaged value can never reveal an unbounded UI). Absent in older backups.
  base.hints = Object.fromEntries(
    Object.entries(base.hints)
      .filter(([, v]) => Number.isInteger(v) && v >= 0)
      .map(([k, v]) => [k, Math.min(v, 5)]),
  );
  // Weighted rubrics: checked criterion indices per project. Its own clamp (0..11)
  // rather than reusing projectChecks' 6-milestone cap.
  base.rubrics = Object.fromEntries(
    Object.entries(base.rubrics)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [
        k,
        [...new Set(v.filter((n) => Number.isInteger(n) && n >= 0 && n < 12))],
      ]),
  );
  // Per-track completion records: { js|cs: earnedTimestamp }. Optional in older
  // backups; stamped once when a track first reaches 100% (see app.js). A record
  // of practice, not accreditation.
  base.certificates = Object.fromEntries(
    Object.entries(base.certificates).filter(
      ([k, v]) => (k === "js" || k === "cs") && Number.isFinite(v) && v > 0,
    ),
  );
  base.certName = typeof raw.certName === "string" ? raw.certName.trim().slice(0, 60) : "";
  base.goal = [15, 30, 60, 90].includes(raw.goal) ? raw.goal : 30;
  base.focusSeconds = Number.isFinite(raw.focusSeconds)
    ? Math.max(0, raw.focusSeconds)
    : 0;
  if (raw.focusByDay && typeof raw.focusByDay === "object" && !Array.isArray(raw.focusByDay))
    base.focusByDay = Object.fromEntries(Object.entries(raw.focusByDay).filter(
      ([day, seconds]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(seconds) && seconds >= 0,
    ));
  const timer = raw.focusTimer;
  if (timer && Number.isFinite(timer.remainingMs) && timer.remainingMs >= 0 && timer.remainingMs <= FOCUS_SESSION_MS) {
    base.focusTimer = {
      remainingMs: timer.remainingMs,
      accountedAt: timer.remainingMs > 0 && Number.isSafeInteger(timer.accountedAt) && timer.accountedAt >= 0 && timer.accountedAt < 8e15
        ? timer.accountedAt : null,
    };
  }
  base.lastLesson = typeof raw.lastLesson === "string" ? raw.lastLesson : null;
  base.onboarded = raw.onboarded === true;
  base.lastExport = Number.isFinite(raw.lastExport) && raw.lastExport >= 0 ? raw.lastExport : 0;
  return base;
}

// Field-level merge. One tab must not overwrite another tab's work, and one
// device must not overwrite another device's work — the same problem, so the
// browser store and the sync service replay the same change objects rather than
// keeping two copies of the rules that could drift apart.
const MERGE_MAPS = ["notes", "drafts", "quizzes", "reviews", "activity", "focusByDay", "hints", "certificates"];
// Counters merge by commutative delta, so two devices' study time adds up
// instead of one replacing the other.
const MERGE_ADDS = ["activity", "focusByDay"];
const MERGE_SETS = ["completed", "solved"];
const MERGE_STEPS = { projectChecks: 6, rubrics: 12 };
const MERGE_SCALARS = ["goal", "lastLesson", "focusSeconds", "focusTimer", "onboarded", "lastExport", "certName"];
// A running 25-minute timer belongs to the machine it was started on. Tabs on
// one device still merge it (that is the same clock), but it must never travel
// to an account, or a second device would believe a session is under way.
export const DEVICE_LOCAL = ["focusTimer"];
const SYNC_SCALARS = MERGE_SCALARS.filter(name => !DEVICE_LOCAL.includes(name));
// Free text is the only place a silent overwrite would lose real writing.
const MERGE_CONFLICTS = ["notes", "drafts", "reviews"];
const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];
const mergeSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Save only what this tab changed, rather than replacing another tab's work.
export function progressChanges(before, after) {
  const changes = [];
  for (const name of MERGE_MAPS) {
    for (const key of new Set([...Object.keys(before[name]), ...Object.keys(after[name])])) {
      if (!mergeSame(before[name][key], after[name][key]))
        changes.push({ path: [name, key], before: before[name][key], value: after[name][key], add: MERGE_ADDS.includes(name) });
    }
  }
  for (const name of MERGE_SETS)
    for (const key of after[name].filter(key => !before[name].includes(key)))
      changes.push({ path: [name], append: key });
  for (const [name, limit] of Object.entries(MERGE_STEPS)) {
    for (const key of new Set([...Object.keys(before[name]), ...Object.keys(after[name])])) {
      for (let step = 0; step < limit; step++) {
        const old = (before[name][key] || []).includes(step);
        const value = (after[name][key] || []).includes(step);
        if (old !== value) changes.push({ path: [name, key], step, value });
      }
    }
  }
  for (const name of MERGE_SCALARS)
    if (!mergeSame(before[name], after[name]))
      changes.push({ path: [name], before: before[name], value: after[name], add: name === "focusSeconds" });
  return changes;
}

export function applyProgressChanges(state, changes, checkConflicts = false) {
  const result = structuredClone(state);
  for (const change of changes) {
    const [name, key] = change.path;
    const target = key === undefined ? result : result[name];
    const field = key === undefined ? name : key;
    const current = target[field];
    if (change.append !== undefined) {
      if (!current.includes(change.append)) current.push(change.append);
    } else if (change.step !== undefined) {
      const steps = new Set(current || []);
      change.value ? steps.add(change.step) : steps.delete(change.step);
      target[field] = [...steps].sort();
    } else if (change.add) {
      target[field] = (current || 0) + (change.value || 0) - (change.before || 0);
    } else {
      if (checkConflicts && MERGE_CONFLICTS.includes(name) &&
          !mergeSame(current, change.before) && !mergeSame(current, change.value))
        throw new Error("This work changed in another tab. Export this tab’s progress before reloading to use the saved version.");
      if (change.value === undefined) delete target[field];
      else target[field] = structuredClone(change.value);
    }
  }
  return result;
}

// Changes generated in this tab are trusted; changes arriving from another
// device over the network are not. `applyProgressChanges` assigns through
// `result[name][key]`, so a path of ["__proto__", …] would write onto
// Object.prototype. Rebuild each change from the saved shape's own field lists
// and drop anything that does not fit, re-deriving `add` rather than trusting a
// caller's flag (which could otherwise turn `goal` into a counter).
export function sanitizeChanges(changes) {
  if (!Array.isArray(changes)) return [];
  const safe = [];
  const named = (value) => typeof value === "string" && !UNSAFE_KEYS.includes(value);
  for (const change of changes) {
    if (!change || typeof change !== "object" || !Array.isArray(change.path) || change.path.length > 2) continue;
    const [name, key] = change.path;
    if (!named(name) || (key !== undefined && !named(key))) continue;
    if (MERGE_MAPS.includes(name)) {
      if (key === undefined) continue;
      safe.push({ path: [name, key], before: change.before, value: change.value, add: MERGE_ADDS.includes(name) });
    } else if (MERGE_SETS.includes(name)) {
      if (key !== undefined || typeof change.append !== "string") continue;
      safe.push({ path: [name], append: change.append });
    } else if (MERGE_STEPS[name] !== undefined) {
      if (key === undefined || !Number.isInteger(change.step) ||
          change.step < 0 || change.step >= MERGE_STEPS[name]) continue;
      safe.push({ path: [name, key], step: change.step, value: change.value === true });
    } else if (SYNC_SCALARS.includes(name)) {
      if (key !== undefined) continue;
      safe.push({ path: [name], before: change.before, value: change.value, add: name === "focusSeconds" });
    }
  }
  return safe;
}

// First contact between a device and an account: there is no shared baseline, so
// the delta machinery above cannot run. Combine the two records without ever
// adding a counter to itself — logging in twice must not double a learner's
// study time. Sets union; counters take the larger side per key; free text keeps
// the account's writing and fills empty slots from the device. The result is run
// through sanitizeState so it is schema-valid by construction.
export function adoptState(account, local) {
  const a = sanitizeState(account);
  const b = sanitizeState(local);
  const merged = freshState();
  for (const name of MERGE_SETS)
    merged[name] = [...new Set([...a[name], ...b[name]])];
  // A passed quiz stays passed: neither side's "true" may be erased by the other.
  merged.quizzes = {};
  for (const key of new Set([...Object.keys(a.quizzes), ...Object.keys(b.quizzes)]))
    merged.quizzes[key] = a.quizzes[key] || b.quizzes[key];
  for (const name of Object.keys(MERGE_STEPS)) {
    merged[name] = {};
    for (const key of new Set([...Object.keys(a[name]), ...Object.keys(b[name])]))
      merged[name][key] = [...new Set([...(a[name][key] || []), ...(b[name][key] || [])])].sort((x, y) => x - y);
  }
  for (const name of ["notes", "drafts", "reviews", "hints"]) {
    merged[name] = { ...b[name] };
    for (const [key, value] of Object.entries(a[name])) merged[name][key] = value;
  }
  for (const name of MERGE_ADDS) {
    merged[name] = {};
    for (const key of new Set([...Object.keys(a[name]), ...Object.keys(b[name])]))
      merged[name][key] = Math.max(Number(a[name][key]) || 0, Number(b[name][key]) || 0);
  }
  merged.focusSeconds = Math.max(a.focusSeconds, b.focusSeconds);
  // A track earned on either device stays earned; keep the earliest date.
  merged.certificates = {};
  for (const key of ["js", "cs"]) {
    const dates = [a.certificates[key], b.certificates[key]].filter((v) => Number.isFinite(v) && v > 0);
    if (dates.length) merged.certificates[key] = Math.min(...dates);
  }
  merged.certName = a.certName || b.certName;
  merged.goal = a.goal;
  merged.lastLesson = a.lastLesson || b.lastLesson;
  merged.onboarded = a.onboarded || b.onboarded;
  merged.lastExport = Math.max(a.lastExport, b.lastExport);
  merged.focusTimer = b.focusTimer;
  return sanitizeState(merged);
}

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function streak(activity, date = new Date()) {
  const d = new Date(date);
  let n = 0;
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (activity[dayKey(d)] && n < 36600) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function scheduleReview(previous, rating, now = Date.now()) {
  const count = Math.max(0, Number(previous?.count) || 0);
  const interval =
    rating === "again"
      ? 0
      : rating === "hard"
        ? 1
        : Math.min(
            60,
            Math.max(1, Math.round((Number(previous?.interval) || 0.4) * 2.5)),
          );
  return {
    count: count + 1,
    interval,
    due: now + (rating === "again" ? 10 * 60 * 1000 : interval * 86400000),
  };
}
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
// Shared token sets. The merged default (no `lang`) keeps the read-only codeBlock
// output byte-for-byte identical to before; the editor overlay passes "js"/"cs"
// for language-accurate keywords and block-comment support.
const KEYWORDS = {
  common:
    "return|if|else|for|while|class|new|static|void|true|false|null|this|switch|case|break|try|catch|throw|async|await",
  js: "const|let|var|function|of|in|undefined|yield|typeof|instanceof|extends|super|delete|import|export|from|default",
  cs: "using|namespace|record|interface|public|private|protected|int|string|bool|decimal|double|readonly|override|out|Task|var|foreach|in|get|set|sealed|abstract|virtual|params|is|as",
};
const MERGED =
  "const|let|var|function|return|if|else|for|of|in|while|class|new|static|public|private|void|int|string|bool|decimal|double|async|await|try|catch|throw|using|namespace|record|interface|true|false|null|undefined|this|yield|switch|case|break|out|readonly|override|Task";
function highlightRegex(lang) {
  const words =
    lang === "cs"
      ? KEYWORDS.common + "|" + KEYWORDS.cs
      : lang === "js"
        ? KEYWORDS.common + "|" + KEYWORDS.js
        : MERGED;
  // Explicit languages also colour /* block comments */; the default keeps the
  // original comment rule so existing codeBlock output does not shift.
  const comment = lang ? "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/" : "\\/\\/[^\\n]*";
  return new RegExp(
    `("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|${comment}|\\b(?:${words})\\b|\\b\\d+(?:\\.\\d+)?\\b)`,
    "g",
  );
}
export function highlight(code, lang) {
  const re = highlightRegex(lang);
  let out = "",
    index = 0;
  for (const m of String(code).matchAll(re)) {
    out += escapeHtml(code.slice(index, m.index));
    const t = m[0];
    const cls =
      t.startsWith("//") || t.startsWith("/*")
        ? "comment"
        : /^["'`]/.test(t)
          ? "string"
          : /^\d/.test(t)
            ? "number"
            : "keyword";
    out += `<span class="tok-${cls}">${escapeHtml(t)}</span>`;
    index = m.index + t.length;
  }
  return out + escapeHtml(code.slice(index));
}

// Pressing Enter in a plain textarea drops to column 0. Continue the current
// line's indentation instead, and open a level after a bracket. Returns the text
// to insert over the selection [start, end] and the caret offset from start.
export function indentOnEnter(value, start, end) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const indent = (value.slice(lineStart, start).match(/^[ \t]*/) || [""])[0];
  const opens = { "{": "}", "(": ")", "[": "]" };
  const prev = value[start - 1];
  const step = "  ";
  // Between an empty pair: opener line, indented caret line, dedented closer line.
  if (opens[prev] && value[end] === opens[prev]) {
    const text = "\n" + indent + step + "\n" + indent;
    return { text, caret: 1 + indent.length + step.length };
  }
  const text = "\n" + indent + (opens[prev] ? step : "");
  return { text, caret: text.length };
}

// A failed check is where a learner is most likely to stop. Show the values in
// the shape the lesson wrote them, not as one-lined JSON.
export function formatValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  let pretty;
  try {
    pretty = JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
  if (pretty === undefined) return String(value);
  const compact = pretty.replace(/\n\s*/g, " ");
  return compact.length <= 60 ? compact : pretty;
}
// Returning "5" where 5 was expected is the single most common JS↔C# slip in
// this curriculum, and JSON output makes the quotes easy to miss.
export function valueKind(value) {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}
export function typeMismatch(expected, actual) {
  return valueKind(expected) !== valueKind(actual) && String(expected) === String(actual);
}
// Compiler and runtime messages name the rule that was broken, not what to do
// next. Translate the errors this curriculum actually provokes.
const errorGuides = {
  cs: [
    [/CS0103:[^']*'([^']+)'/, (m) => [
      `C# does not recognise the name \`${m[1]}\`.`,
      "Check the spelling, and that it is declared before this line in the same block. C# is case-sensitive, so `count` and `Count` are different names.",
    ]],
    [/CS1002:/, () => [
      "A statement is missing its semicolon.",
      "Every C# statement ends with `;`. The reported position is where the compiler expected it, usually at the end of the line above.",
    ]],
    [/CS151[34]:/, () => [
      "A brace has no matching partner.",
      "Every `{` needs its own `}`. Check that each method, loop and `if` block is closed.",
    ]],
    [/CS0161:[^']*'([^']+)'/, (m) => [
      `Not every path through \`${m[1]}\` returns a value.`,
      "Add a `return` for the remaining case: the `else` branch, or the line after a loop that might not run.",
    ]],
    [/CS0029:.*'([^']+)' to '([^']+)'/, (m) => [
      `C# will not convert \`${m[1]}\` to \`${m[2]}\` on its own.`,
      "Unlike JavaScript, C# checks types before running. Convert explicitly with `.ToString()`, `int.Parse(...)` or `Convert.ToInt32(...)`, or change the declared type.",
    ]],
    [/CS1503:.*from '([^']+)' to '([^']+)'/, (m) => [
      `This argument is \`${m[1]}\`, but the method expects \`${m[2]}\`.`,
      "Convert the value before passing it, or check that you are calling the overload you meant to.",
    ]],
    [/CS0165:[^']*'([^']+)'/, (m) => [
      `\`${m[1]}\` is read before it has been given a value.`,
      "C# requires a local variable to be assigned on every path before it is used. Give it a starting value where you declare it.",
    ]],
    [/CS0246:[^']*'([^']+)'/, (m) => [
      `C# does not know a type called \`${m[1]}\`.`,
      "Check the spelling, or add the `using` directive for its namespace. Common `System` namespaces are already imported for you.",
    ]],
    [/CS1061:.*'([^']+)' does not contain a definition for '([^']+)'/, (m) => [
      `\`${m[1]}\` has no member named \`${m[2]}\`.`,
      "C# member names begin with a capital letter: `Length`, `Count`, `ToUpper()`. Check the exact name in the language reference.",
    ]],
    [/CS0019:/, () => [
      "This operator cannot be used with those types.",
      "C# does not mix types the way JavaScript does. Convert both sides to the same type first.",
    ]],
    [/NullReferenceException/, () => [
      "A value was null where an object was expected.",
      "Check that the variable was assigned, or read the member with `?.` so a null value is skipped instead of throwing.",
    ]],
    [/(?:IndexOutOfRange|ArgumentOutOfRange)Exception/, () => [
      "An index fell outside the collection.",
      "Valid indexes run from `0` to `Length - 1`. Check the loop's stop condition and any subtraction inside the index.",
    ]],
    [/DivideByZeroException/, () => [
      "A whole number was divided by zero.",
      "Guard the divisor before dividing. Integer division throws here, where floating-point division would give `Infinity`.",
    ]],
    [/FormatException/, () => [
      "Text could not be parsed into the requested type.",
      "Use `int.TryParse(text, out var value)` when the input might not be a number, and trim surrounding spaces first.",
    ]],
    [/error CS\d+:/, () => [
      "The C# compiler rejected this code, so nothing ran.",
      "The numbers after the file name are the line and column. Fix the first error listed — the ones below it are often caused by the same mistake.",
    ]],
  ],
  js: [
    [/ReferenceError: ([\w$]+) is not defined/, (m) => [
      `\`${m[1]}\` has not been defined.`,
      "Check the spelling, and that it is declared with `const` or `let` above this line. A variable declared inside `{ }` is not visible outside it.",
    ]],
    [/([\w$.]+) is not a function/, (m) => [
      `\`${m[1]}\` exists, but it is not a function.`,
      "Check the name — the array methods are `map`, `filter` and `forEach`. Calling a value that is `undefined` reports this too.",
    ]],
    [/Cannot read properties of (undefined|null) \(reading '([^']+)'\)/, (m) => [
      `Something was \`${m[1]}\` where a value with \`.${m[2]}\` was expected.`,
      "A function that ends without `return` gives `undefined`, and so does an array index past the end. Log the value on the line before to see what it really is.",
    ]],
    [/Cannot read property '([^']+)' of (undefined|null)/, (m) => [
      `Something was \`${m[2]}\` where a value with \`.${m[1]}\` was expected.`,
      "A function that ends without `return` gives `undefined`, and so does an array index past the end. Log the value on the line before to see what it really is.",
    ]],
    [/is not iterable/, () => [
      "This value cannot be looped over.",
      "`for…of` and spreading work on arrays, strings, `Map` and `Set`. To loop over a plain object use `Object.keys(...)` or `Object.entries(...)`.",
    ]],
    [/Assignment to constant variable/, () => [
      "A `const` binding cannot be given a new value.",
      "Use `let` when the variable needs to change. A `const` array or object can still have its contents modified.",
    ]],
    [/Maximum call stack size exceeded/, () => [
      "A function called itself until the stack ran out.",
      "A recursive function needs a base case that returns without calling itself, and each call has to move towards it.",
    ]],
    [/SyntaxError: Unexpected end of input/, () => [
      "The code ended while a bracket was still open.",
      "Count the `{`, `(` and `[` characters. Each one needs a closing partner.",
    ]],
    [/SyntaxError: Unexpected token/, () => [
      "JavaScript could not parse this code.",
      "Look just before the reported position for a missing comma, bracket or quote.",
    ]],
  ],
};
export function explainError(message, lang = "js") {
  const text = String(message ?? "");
  for (const key of lang === "cs" ? ["cs", "js"] : ["js", "cs"])
    for (const [pattern, build] of errorGuides[key]) {
      const match = text.match(pattern);
      if (match) {
        const [summary, hint] = build(match);
        return { summary, hint };
      }
    }
  return null;
}

// Progressive hints. Every lesson gets staged help with no authoring: a
// conceptual nudge, then a pointer at the failing test, then the worked
// solution. A lesson may supply its own `hints[]` strings, which replace the two
// generic tiers; the solution tier is always appended last. Pure data — the
// renderer decides how many tiers are unlocked and pulls the solution itself.
export function hintTiers(lesson) {
  const tiers = [];
  const authored = Array.isArray(lesson?.hints)
    ? lesson.hints.filter((h) => typeof h === "string" && h.trim())
    : [];
  if (authored.length) {
    authored.forEach((body, i) => tiers.push({ title: `Hint ${i + 1}`, body }));
  } else {
    const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
    const last = sections[sections.length - 1];
    tiers.push({
      title: "Where to start",
      body:
        last && last[1]
          ? last[1]
          : "Re-read the prompt and name the value you start with and the value you must return.",
    });
    tiers.push({
      title: "Check the failing test",
      body: "Take the first failing check above and run your code on that exact input by hand. Compare what you produce with the expected value — the gap points at the line to change.",
    });
  }
  tiers.push({ title: "See a worked solution", solution: true });
  return tiers;
}

// A per-track completion record is earned when every lesson id in the track has
// been completed. Pure and data-only: existence is DERIVED from already-synced
// progress, so a certificate appears on every device without its own sync path.
// `state.certificates[lang]` only remembers the date it was first earned.
export function certificateEarned(completed, lessonIds) {
  const done = new Set(Array.isArray(completed) ? completed : []);
  return (
    Array.isArray(lessonIds) &&
    lessonIds.length > 0 &&
    lessonIds.every((id) => done.has(id))
  );
}

// The certificate artwork, as a standalone SVG string. Pure so its wording is
// unit-testable and so app.js can both inject it into a dialog and serialize it
// to a PNG. Colours are explicit (not CSS variables) so a canvas export and a
// print render look the same in either theme. The honest framing line is part of
// the artwork itself — a record of practice, deliberately not a credential.
export function certificateSvg({ name, trackName, dateText, accent = "#c8971f" } = {}) {
  const learner = escapeHtml((name || "").trim() || "A dedicated learner");
  const track = escapeHtml(trackName || "");
  const when = escapeHtml(dateText || "");
  const stroke = escapeHtml(accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 500" width="720" height="500" role="img" aria-label="Certificate of practice for the ${track} track">
  <rect width="720" height="500" fill="#fbf7ee"/>
  <rect x="16" y="16" width="688" height="468" fill="none" stroke="${stroke}" stroke-width="3"/>
  <rect x="26" y="26" width="668" height="448" fill="none" stroke="#2c2a28" stroke-width="1"/>
  <text x="360" y="96" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="19" letter-spacing="5" fill="#6a6257">FORGE CODE ACADEMY</text>
  <text x="360" y="168" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="42" fill="#2c2a28">Certificate of Practice</text>
  <text x="360" y="212" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#6a6257">This records that</text>
  <text x="360" y="266" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-style="italic" fill="#2c2a28">${learner}</text>
  <text x="360" y="312" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#6a6257">worked through every lesson and challenge of</text>
  <text x="360" y="352" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="${stroke}">${track}</text>
  <line x1="200" y1="392" x2="520" y2="392" stroke="#d8cdb5" stroke-width="1"/>
  <text x="360" y="416" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#6a6257">${when}</text>
  <text x="360" y="452" text-anchor="middle" font-family="Georgia, serif" font-size="12.5" fill="#8a8072">A record of practice at Forge Code Academy — not a professional credential.</text>
</svg>`;
}

// A project is built in the learner's own environment, so its rubric is a
// weighted self-assessment: the percentage of criterion weight ticked off, and
// whether that clears the project's pass line.
export function rubricScore(rubric, checkedIndices = []) {
  const criteria = Array.isArray(rubric?.criteria) ? rubric.criteria : [];
  const total = criteria.reduce((sum, c) => sum + (Number(c?.weight) || 0), 0);
  const checked = new Set(checkedIndices);
  const earned = criteria.reduce(
    (sum, c, i) => sum + (checked.has(i) ? Number(c?.weight) || 0 : 0),
    0,
  );
  const pass = Number.isFinite(rubric?.pass) ? rubric.pass : 80;
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { percent, passed: percent >= pass, pass };
}

// Resolve a saved appearance preference to the concrete theme to paint. Kept
// pure so the boot guard and the settings handler agree on one rule.
export function resolveTheme(pref, prefersDark) {
  if (pref === "dark" || pref === "light") return pref;
  return prefersDark ? "dark" : "light";
}
