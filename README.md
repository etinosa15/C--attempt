# Forge Code Academy

A personal, local website for studying JavaScript and C# deeply. No npm dependencies, account, API key, or paid service is required.

## Start

On Windows, double-click **Start Forge.cmd** and keep its terminal window open. It starts the server and opens **http://localhost:4317**.

Or, in this folder, run:

```text
npm start
```

Then open http://localhost:4317 in a browser. Press Ctrl+C in the terminal to stop it. Use the same browser and URL to keep accessing your saved progress. If the port is occupied by another program, set `PORT` to another number before starting.

### Opening with VS Code Live Server

Live Server (usually port 5500) serves static files; it does not start Forge's Node.js server or C# compiler. The project-root `index.html` shows launch instructions and a link to the complete academy. Run `npm start` in the VS Code terminal, or double-click `Start Forge.cmd` in File Explorer, then use **http://localhost:4317**. You do not need Live Server to run Forge.

### Requirements

- Node.js 20 or later.
- .NET 10 SDK for the C# runner. JavaScript and lessons work without it. The SDK and runtime are detected locally; there is no NuGet restore or network compilation step.
- A modern browser with Web Workers and localStorage.

## What is included

- **40 substantial lessons**: 20 JavaScript and 20 C#, from foundations to engineering practice. Every lesson has mental models, worked code, common mistakes, a prediction question, an executable challenge, notes, and an official reference link.
- **132 behavioral checks** across the 40 coding challenges, including empty inputs, boundaries, errors, immutability, and cancellation where applicable.
- **Real execution**: JavaScript in a fresh browser worker; C# compiled by the installed Roslyn compiler and executed on .NET. The runner does not pretend to compile C# or grade code by matching text.
- **Language bridge**: six direct comparisons of JavaScript and C# semantics.
- **Spaced review**: cards created from completed lessons, with Again (10 minutes), With effort (1 day), and Got it (growing intervals up to 60 days). Exploring all cards is also possible. This is a simple transparent heuristic, not a personalized research-grade memory model.
- **Six project briefs** with milestones, suggested starting ideas, official resources, and stretch goals. These are projects for you to implement, not generated completed applications.
- **Notebook, draft autosave, focus timer, search, and progress export/import**.
- **A separate isolated DOM lab** for browser events and HTML practice.

## Suggested study routine

1. Start with JavaScript Foundations or C# Foundations; neither assumes prior coding experience.
2. Read slowly and trace the worked example before executing it.
3. Answer the concept question and solve the challenge. Both are required to mark a lesson complete.
4. Use the hints and solutions after a serious attempt; then rebuild the solution from memory.
5. Explain the concept in your notes and review its card later.
6. After Foundations, build a foundation project. Use the intermediate and capstone projects as the curriculum progresses.

Lesson timings are estimates and exclude extended project work. Completion is a record of practice, not a certification of professional mastery. Reference links point to MDN and Microsoft Learn for deeper study.

## Local execution and storage

The server binds only to 127.0.0.1, checks the Host and Origin headers, and requires a same-origin token for C# execution. It serves only the `public` folder. C# runs as your current OS user and is **not an operating-system sandbox**. Run your own trusted code; do not expose this service on the public internet. C# compilation and execution have time/output limits. JavaScript workers have a 4-second timeout and no network access. The DOM iframe has a separate sandbox and no access to academy storage; unlike a worker, synchronous DOM code can still make its frame unresponsive.

Progress is stored in browser localStorage. Export a backup from **Settings & backups**, especially before clearing browser data or changing browsers. Import deliberately replaces current progress after confirmation. Notes and code are not sent to an external service. Optional official documentation links require internet access.

Console exercises use one file. ES module imports and ASP.NET server examples are explained as multi-file/project examples rather than executed in that console. Use the DOM lab for `document` and event handlers. Await asynchronous work in the JavaScript console so it completes before the runner ends.

## Checks

```text
npm test
npm run verify:curriculum
```

The first command checks progress handling, scheduling, rendering safety, and curriculum integrity. The second executes all 40 reference solutions against all 132 challenge checks, using real .NET for C#.

## File map

- `server.mjs`: dependency-free HTTP server and local C# compiler runner.
- `public/app.js`, `styles.css`: responsive interface and interactions.
- `public/js-lessons.js`, `cs-lessons.js`: authored curriculum and exercises.
- `public/curriculum.js`: tracks, language comparisons, and project briefs.
- `public/core.js`: persistence validation, scheduling, and shared rendering helpers.
- `public/runner-worker.js`: isolated JavaScript console.
- `public/dom-preview.*`: sandboxed browser lab.
- `tests/`: behavioral and curriculum checks.
- `.runtime/`: transient C# compilation folders; removed after each run.

No build step is necessary. Edit the files and refresh the page.
