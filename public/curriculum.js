import js from "./js-lessons.js";
import cs from "./cs-lessons.js";
export const lessons = [...js, ...cs];
export const modules = [
  "Foundations",
  "Think in data",
  "Beyond the basics",
  "Build with confidence",
  "Engineering practice",
];
export const tracks = {
  js: {
    name: "JavaScript",
    short: "JS",
    tag: "THE LANGUAGE OF THE WEB",
    description:
      "From your first variable to asynchronous applications. Understand the language behind the browser.",
    color: "yellow",
    lessons: js,
  },
  cs: {
    name: "C#",
    short: "C#",
    tag: "THE LANGUAGE OF POSSIBILITY",
    description:
      "Think in types. Build reliable systems with C#, .NET, and the tools of modern software engineering.",
    color: "purple",
    lessons: cs,
  },
};
export const bridges = [
  {
    title: "Variables & types",
    js: 'let count = 3;\ncount = "three"; // allowed',
    cs: 'var count = 3;\n// count = "three"; // compile error',
    note: "JavaScript types belong to values. C# variables have static types; var infers the type instead of removing it.",
  },
  {
    title: "Truth & conditions",
    js: "if (items.length) { /* non-empty */ }",
    cs: "if (items.Length > 0) { /* non-empty */ }",
    note: "JavaScript coerces conditions using truthiness. C# requires an actual bool expression.",
  },
  {
    title: "Transforming data",
    js: "values.filter(x => x > 0)\n  .map(x => x * 2);",
    cs: "values.Where(x => x > 0)\n  .Select(x => x * 2).ToArray();",
    note: "Array filter/map are eager. LINQ Where/Select are normally deferred until enumeration; ToArray materializes the result.",
  },
  {
    title: "Missing values",
    js: 'const name = user?.name ?? "Guest";',
    cs: 'string name = user?.Name ?? "Guest";',
    note: "Both support null-conditional access and null-coalescing. JavaScript also has undefined; C# nullable annotations guide compile-time analysis.",
  },
  {
    title: "Asynchronous results",
    js: "async function getValue() {\n  return await Promise.resolve(42);\n}",
    cs: "static async Task<int> GetValue() {\n  return await Task.FromResult(42);\n}",
    note: "Both methods return an eventual result. async alone does not mean running CPU work on a new thread.",
  },
  {
    title: "Object equality",
    js: '({name: "Ada"}) === ({name: "Ada"});\n// false: different objects',
    cs: '// record User(string Name);\nnew User("Ada") == new User("Ada");\n// true: record equality',
    note: "Ordinary JavaScript objects compare by identity. C# record types generate value-based equality; ordinary classes generally use reference identity unless customized.",
  },
];
export const projects = [
  {
    id: "habit",
    lang: "js",
    level: "Foundation",
    title: "A habit tracker you will actually use",
    summary: "Turn daily routines into a small, persistent web app.",
    time: "3–5 hours",
    skills: ["DOM & events", "State", "localStorage"],
    brief:
      "Build an accessible single-page habit tracker. The user can add a habit, mark it done for a local calendar day, and see a seven-day history. Treat the saved habits as your source of truth and derive the display from that state.",
    steps: [
      "Create a form with a labeled habit name and reject whitespace-only names.",
      "Render habits with real buttons for toggling today’s completion.",
      "Use stable IDs so duplicate display names do not break updates.",
      "Persist versioned JSON in localStorage and recover from invalid saved data.",
      "Show an empty state, a seven-day history, and a total based on real completions.",
      "Verify adding, toggling, reloading, and keyboard navigation end to end.",
    ],
    stretch:
      "Add import/export, an undo action for deletion, and tests for date boundaries.",
    starter:
      '// Start with the pure rule, then connect it to your DOM.\nfunction toggleDay(habit, day) {\n  const days = new Set(habit.days);\n  days.has(day) ? days.delete(day) : days.add(day);\n  return {...habit, days: [...days]};\n}\nconsole.log(toggleDay({id: "1", name: "Read", days: []}, "2026-09-12"));',
    resources:
      "https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage",
  },
  {
    id: "expense",
    lang: "cs",
    level: "Foundation",
    title: "Your personal expense ledger",
    summary: "Build a console app with accurate money and durable data.",
    time: "4–6 hours",
    skills: ["Collections", "decimal", "JSON & files"],
    brief:
      "Create a console application that records an amount, category, description, and date. Separate commands from calculations so the same rules could later power a web API. Use decimal and an explicit rounding policy.",
    steps: [
      "Create a console project with dotnet new console in a separate project subfolder.",
      "Model an expense with a stable ID, decimal amount, category, and date.",
      "Validate input with TryParse; reject negative amounts and empty categories.",
      "Support add, list, category totals, and monthly totals.",
      "Save JSON and handle missing or malformed files with a useful message.",
      "Test empty data, fractional amounts, month boundaries, and reload.",
    ],
    stretch:
      "Add CSV export and an edit command. Make file saving resilient to an interrupted write.",
    starter:
      "record Expense(decimal Amount, string Category);\n// Put top-level statements before record declarations.\n// Start by testing a pure total function in the playground.",
    resources:
      "https://learn.microsoft.com/en-us/dotnet/core/tutorials/with-visual-studio-code",
  },
  {
    id: "explorer",
    lang: "js",
    level: "Intermediate",
    title: "A resilient data explorer",
    summary: "Search remote data without stale results or mystery errors.",
    time: "5–8 hours",
    skills: ["fetch", "AbortController", "Testing"],
    brief:
      "Build a searchable explorer using a public API of your choice, or a local JSON dataset first. Keep fetching, filtering, and rendering separate. Every request should have a clear lifecycle visible in the UI.",
    steps: [
      "Build a search form and a results list with useful accessible labels.",
      "Inject a fetch function so tests can supply offline responses.",
      "Handle loading, empty results, HTTP errors, network failures, and invalid JSON.",
      "Cancel superseded requests or ignore stale responses so old results cannot overwrite new ones.",
      "Add sorting and keep search state in the URL.",
      "Test fast successive searches, failed responses, and zero results.",
    ],
    stretch:
      "Add caching with an expiry policy and a retry action with a capped backoff.",
    starter:
      'async function fetchData(fetcher) {\n  const response = await fetcher();\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  return response.json();\n}\nconsole.log(await fetchData(async () => ({ok:true, json:async()=>[{name:"Ada"}]})));',
    resources:
      "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
  },
  {
    id: "library",
    lang: "cs",
    level: "Intermediate",
    title: "A library lending API",
    summary: "Design a small ASP.NET Core service with real domain rules.",
    time: "6–10 hours",
    skills: ["ASP.NET Core", "Interfaces", "Validation"],
    brief:
      "Build an HTTP API for a small lending library. Separate book data from loan data. A book cannot be loaned twice concurrently, and a returned loan must retain its history. Start with in-memory persistence behind a small interface.",
    steps: [
      "Run dotnet new web -o LibraryApi in a separate project subfolder.",
      "Define book, member, and loan DTOs with stable IDs.",
      "Create endpoints for listing books, creating loans, and returning loans.",
      "Reject unknown books, invalid members, and already-loaned books with deliberate status codes.",
      "Inject a clock and a repository interface into the lending service.",
      "Test the domain rules and one HTTP journey; document example requests.",
    ],
    stretch:
      "Add a database, transactions for loan creation, authentication, and per-resource authorization.",
    starter:
      "static bool CanBorrow(bool exists, bool alreadyLoaned)\n{\n    return exists && !alreadyLoaned;\n}\nConsole.WriteLine(CanBorrow(true, false));",
    resources:
      "https://learn.microsoft.com/en-us/aspnet/core/tutorials/min-web-api",
  },
  {
    id: "study",
    lang: "js",
    level: "Capstone",
    title: "Build your own study engine",
    summary: "Combine scheduling, state, tests, and a usable interface.",
    time: "8–12 hours",
    skills: ["Architecture", "Algorithms", "Accessibility"],
    brief:
      "Build a flashcard app with explicit review scheduling. A card has front, back, interval, and due time. Let learners attempt recall before revealing an answer, then grade confidence. Use a controllable clock for tests.",
    steps: [
      "Write a pure scheduling function with Again, Hard, and Good ratings.",
      "Show only due cards and provide an honest all-done state.",
      "Store versioned cards and review history; support JSON export/import.",
      "Implement keyboard-accessible reveal and grade actions.",
      "Test due boundaries, failed recall, empty decks, and malformed imports.",
      "Document the scheduling policy and evaluate it with actual study sessions.",
    ],
    stretch:
      "Support separate decks, editing cards, and search without exposing answers before recall.",
    starter:
      "function nextReview(now, intervalDays) {\n  return now + intervalDays * 24 * 60 * 60 * 1000;\n}\nconsole.log(nextReview(0, 1));",
    resources: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
  },
  {
    id: "fullstack",
    lang: "cs",
    level: "Capstone",
    title: "One app. Both languages.",
    summary: "Connect a JavaScript client to your own C# task API.",
    time: "12–18 hours",
    skills: ["JavaScript + C#", "HTTP", "Persistence"],
    brief:
      "Build a task board with a JavaScript frontend and ASP.NET Core backend. Define the API contract first, including errors. Use one server origin initially to simplify deployment. Build one complete create-and-list journey before adding more features.",
    steps: [
      "Define request/response DTOs and endpoint status codes for tasks.",
      "Build an accessible frontend form and fetch wrapper with explicit error states.",
      "Create C# endpoints that validate input and call an isolated task service.",
      "Persist tasks and support create, list, update, and archive with stable IDs.",
      "Handle stale updates with a version or concurrency token.",
      "Test the complete user journey and document backup, startup, and known limitations.",
    ],
    stretch:
      "Add accounts and ownership checks, then deploy only after reviewing configuration and secret handling.",
    starter:
      'static string? ValidateTask(string? title)\n{\n    return string.IsNullOrWhiteSpace(title) ? "Title is required" : null;\n}\nConsole.WriteLine(ValidateTask("Build something"));',
    resources: "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/",
  },
];
