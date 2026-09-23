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
    pitfalls: [
      {
        trap: "Reading state back out of the DOM.",
        fix: "Keep your saved habits as the single source of truth and rebuild the display from that state. When the DOM and your data disagree, the DOM is the copy that lies.",
      },
      {
        trap: "Keying habits by their display name.",
        fix: "Give each habit a stable ID. Two habits can share a name, and renaming one should not silently move its history to another.",
      },
      {
        trap: "Storing \"done today\" as a boolean.",
        fix: "Record the calendar day a habit was completed. A boolean is still true tomorrow, so completion rots at midnight instead of rolling over.",
      },
    ],
    starter:
      '// Start with the pure rule, then connect it to your DOM.\nfunction toggleDay(habit, day) {\n  const days = new Set(habit.days);\n  days.has(day) ? days.delete(day) : days.add(day);\n  return {...habit, days: [...days]};\n}\nconsole.log(toggleDay({id: "1", name: "Read", days: []}, "2026-09-12"));',
    resources:
      "https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage",
    rubric: {
      pass: 80,
      criteria: [
        { label: "Saved state is the single source of truth; the display is rebuilt from it, never read back out of the DOM.", weight: 25 },
        { label: "Habits are keyed by a stable ID, so duplicate names and renames never move history to the wrong habit.", weight: 20 },
        { label: "Completion is recorded per calendar day, not as a boolean that stays true tomorrow.", weight: 20 },
        { label: "State persists as versioned JSON and recovers gracefully from invalid saved data.", weight: 20 },
        { label: "Empty state, a seven-day history, and full keyboard navigation all work.", weight: 15 },
      ],
    },
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
    pitfalls: [
      {
        trap: "Using double for money.",
        fix: "Use decimal and decide a rounding policy up front. Binary floating point cannot represent 0.10 exactly, so sums of double drift by a cent and never quite reconcile.",
      },
      {
        trap: "Parsing input with Parse.",
        fix: "Use TryParse and reject what fails. Parse throws a FormatException on the first stray character, which crashes the whole app over one mistyped amount.",
      },
      {
        trap: "Saving by overwriting the file in place.",
        fix: "Write to a temporary file, then replace the original. A crash midway through an in-place write leaves the ledger half-written and unreadable.",
      },
    ],
    starter:
      "record Expense(decimal Amount, string Category);\n// Put top-level statements before record declarations.\n// Start by testing a pure total function in the playground.",
    resources:
      "https://learn.microsoft.com/en-us/dotnet/core/tutorials/with-visual-studio-code",
    rubric: {
      pass: 80,
      criteria: [
        { label: "Money uses decimal with an explicit, deliberate rounding policy — never double.", weight: 25 },
        { label: "Input is parsed with TryParse; negative amounts and empty categories are rejected.", weight: 20 },
        { label: "Add, list, category totals, and monthly totals all produce correct results.", weight: 20 },
        { label: "Data saves to JSON and missing or malformed files fail with a useful message, not a crash.", weight: 20 },
        { label: "Commands are separated from calculations, so the rules could power an API unchanged.", weight: 15 },
      ],
    },
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
    pitfalls: [
      {
        trap: "Letting a slow response overwrite a newer one.",
        fix: "Cancel superseded requests or ignore out-of-order responses. Type quickly and an earlier, slower search can land last and paint stale results over the ones the user actually wanted.",
      },
      {
        trap: "Calling fetch directly inside your logic.",
        fix: "Inject the fetch function so tests can supply offline responses. Hard-wired network calls make the interesting cases — errors, timeouts, empty results — impossible to test.",
      },
      {
        trap: "Treating every response as success.",
        fix: "Check response.ok before reading the body. fetch does not reject on a 404 or 500, so a failed request quietly becomes a confusing JSON parse error further down.",
      },
    ],
    starter:
      'async function fetchData(fetcher) {\n  const response = await fetcher();\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  return response.json();\n}\nconsole.log(await fetchData(async () => ({ok:true, json:async()=>[{name:"Ada"}]})));',
    resources:
      "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    rubric: {
      pass: 80,
      criteria: [
        { label: "The fetch function is injected, so tests can supply offline responses.", weight: 20 },
        { label: "Loading, empty results, HTTP errors, network failures, and invalid JSON each have a clear state.", weight: 25 },
        { label: "Superseded requests are cancelled or stale responses ignored, so old results never overwrite newer ones.", weight: 25 },
        { label: "response.ok is checked before the body is read.", weight: 15 },
        { label: "Search state lives in the URL and sorting works.", weight: 15 },
      ],
    },
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
    pitfalls: [
      {
        trap: "Mixing HTTP and JSON into the domain rules.",
        fix: "Keep the lending rules behind a small interface that knows nothing about requests. Rules tangled with the web layer cannot be tested or reused without spinning up a server.",
      },
      {
        trap: "Deleting a loan when a book is returned.",
        fix: "Mark the loan returned and keep its history. Deleting it erases the record of who borrowed what, which is exactly the question a lending system exists to answer.",
      },
      {
        trap: "Calling DateTime.Now inside the service.",
        fix: "Inject a clock. Reading the real time deep in your logic makes due-date and overdue rules impossible to test without waiting for the calendar to catch up.",
      },
    ],
    starter:
      "static bool CanBorrow(bool exists, bool alreadyLoaned)\n{\n    return exists && !alreadyLoaned;\n}\nConsole.WriteLine(CanBorrow(true, false));",
    resources:
      "https://learn.microsoft.com/en-us/aspnet/core/tutorials/min-web-api",
    rubric: {
      pass: 80,
      criteria: [
        { label: "Lending rules live behind a small interface that knows nothing about HTTP or JSON.", weight: 25 },
        { label: "A book cannot be loaned twice concurrently.", weight: 20 },
        { label: "A returned loan is marked returned and keeps its history rather than being deleted.", weight: 20 },
        { label: "Unknown books and invalid members are rejected with deliberate status codes.", weight: 20 },
        { label: "A clock and a repository interface are injected, and the domain rules are tested.", weight: 15 },
      ],
    },
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
    pitfalls: [
      {
        trap: "Reading Date.now() inside the scheduler.",
        fix: "Pass the current time in as an argument. A scheduler that reads the clock itself produces due-boundary tests that pass in the morning and fail at night.",
      },
      {
        trap: "Putting the answer in the DOM before recall.",
        fix: "Reveal the back of the card only after the learner commits. If the answer is already in the page — even hidden with CSS — the recall practice that makes flashcards work never happens.",
      },
      {
        trap: "Trusting imported JSON.",
        fix: "Validate an imported deck against your version and shape before using it. One malformed field from an old or hand-edited file can corrupt the whole review schedule.",
      },
    ],
    starter:
      "function nextReview(now, intervalDays) {\n  return now + intervalDays * 24 * 60 * 60 * 1000;\n}\nconsole.log(nextReview(0, 1));",
    resources: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    rubric: {
      pass: 80,
      criteria: [
        { label: "Scheduling is a pure function that takes the current time as an argument.", weight: 25 },
        { label: "The answer is revealed only after the learner commits to a recall attempt.", weight: 20 },
        { label: "Versioned cards and review history support validated JSON export and import.", weight: 20 },
        { label: "Reveal and grade actions are fully keyboard-accessible.", weight: 20 },
        { label: "Only due cards are shown, with an honest all-done state.", weight: 15 },
      ],
    },
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
    pitfalls: [
      {
        trap: "Building the UI before the API contract.",
        fix: "Agree the request and response shapes — including error shapes — first. A frontend written against a guessed contract has to be rebuilt once the real endpoints disagree with it.",
      },
      {
        trap: "Letting the last write win.",
        fix: "Carry a version or concurrency token on updates. Without one, two edits to the same task silently overwrite each other and the earlier change simply vanishes.",
      },
      {
        trap: "Coding only the happy path on the client.",
        fix: "Give the UI explicit loading and error states. A client that assumes every request succeeds freezes with no explanation the moment the network or the server has a bad day.",
      },
    ],
    starter:
      'static string? ValidateTask(string? title)\n{\n    return string.IsNullOrWhiteSpace(title) ? "Title is required" : null;\n}\nConsole.WriteLine(ValidateTask("Build something"));',
    resources: "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/",
    rubric: {
      pass: 80,
      criteria: [
        { label: "The API contract — including error shapes — is defined before the UI is built.", weight: 20 },
        { label: "The frontend has explicit loading and error states, not just a happy path.", weight: 20 },
        { label: "Endpoints validate input and delegate to an isolated task service.", weight: 20 },
        { label: "Stale updates are handled with a version or concurrency token.", weight: 20 },
        { label: "One complete create-and-list journey works end to end across both languages.", weight: 20 },
      ],
    },
  },
];
