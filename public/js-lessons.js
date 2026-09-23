const t = (label, expression, expected) => ({ label, expression, expected });
const lessons = [];
function add(
  id,
  module,
  title,
  minutes,
  lead,
  sections,
  example,
  explanation,
  trap,
  question,
  choices,
  answer,
  why,
  prompt,
  starter,
  solution,
  tests,
  recall,
  hints = [],
) {
  lessons.push({
    id: "js-" + id,
    lang: "js",
    module,
    title,
    minutes,
    lead,
    sections,
    example,
    explanation,
    trap,
    quiz: { question, choices, answer, why },
    challenge: { prompt, starter, solution, tests },
    recall: { question: recall[0], answer: recall[1] },
    hints,
    docs: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
  });
}
add(
  "values",
  0,
  "Values, variables & types",
  25,
  "Start thinking in values. A variable is a name that points to a value; the name and the value have different rules.",
  [
    [
      "A name for a value",
      "JavaScript has primitive values (string, number, bigint, boolean, undefined, symbol, and null) and objects. Use const when a binding should not be reassigned and let when it should. Types belong to values: a let binding can hold a number now and a string later. That flexibility makes clear naming and small functions valuable.",
    ],
    [
      "Reassignment is not mutation",
      'const prevents replacing a binding. It does not freeze an object: const user = {name: "Ada"} still permits user.name = "Grace". Primitive values are immutable. When you calculate score + 1, you create another number; you do not alter the original number.',
    ],
    [
      "Turn an idea into a function",
      "A function accepts inputs through parameters and sends a value back with return. console.log displays a value for a human; it does not return that value to the caller. First identify the inputs and output, then write the calculation. This distinction is the foundation of every challenge in this course.",
    ],
  ],
  'const language = "JavaScript";\nlet lessons = 0;\nlessons = lessons + 1;\nconsole.log(language, lessons);\nconsole.log(typeof lessons);',
  "The output is JavaScript 1, then number. Reassigning lessons is legal because it uses let. Reassigning language would throw a TypeError.",
  'typeof null is "object", a historical quirk. Use value === null when you need to check for null.',
  "What does const lock in place?",
  [
    "The binding: it cannot be reassigned",
    "Every property of the assigned object",
    "The type of all future values",
  ],
  0,
  "const protects the binding, not the contents of an object.",
  "Write greet(name). Return the string Hello, NAME! using the name passed to the function.",
  'function greet(name) {\n  // Return a greeting.\n}\n\nconsole.log(greet("Ada"));',
  "function greet(name) { return `Hello, ${name}!`; }",
  [
    t("A familiar name", 'greet("Ada")', "Hello, Ada!"),
    t("A different name", 'greet("Tobi")', "Hello, Tobi!"),
    t("Empty input", 'greet("")', "Hello, !"),
  ],
  [
    "How are a binding and a value different?",
    "A binding is the name associated with a value. const forbids assigning another value to that name, but does not make an object immutable.",
  ],
);
add(
  "operators",
  0,
  "Coercion & deliberate conversion",
  30,
  "Make conversion explicit so the language does not make surprising decisions for you.",
  [
    [
      "The + operator has two jobs",
      'For numbers, + adds. If either operand becomes a string during primitive conversion, + concatenates. Thus 2 + 3 is 5, but "2" + 3 is "23". Form inputs are strings even when the input looks numeric. Convert at the boundary, then calculate with numbers inside your program.',
    ],
    [
      "Equality with clear rules",
      'Use === and !== by default. They compare without the coercion used by ==. NaN is not equal to itself; Number.isNaN detects it. Number.isFinite rejects NaN and infinities without converting its input. Be deliberate about empty strings: Number("") is 0, which may not be acceptable validation for a form.',
    ],
    [
      "Fallbacks mean different things",
      'The || operator falls back for any falsy value, including 0, false, and "". The ?? operator falls back only for null and undefined. If zero is a valid quantity, quantity ?? 1 preserves it while quantity || 1 replaces it.',
    ],
  ],
  'const price = Number("125.50");\nconsole.log(price + 10); // 135.5\nconsole.log(0 || 10);    // 10\nconsole.log(0 ?? 10);    // 0',
  "The explicit Number conversion prevents string concatenation. The two fallback operators answer different questions.",
  'parseInt("12px") returns 12. That is useful parsing, but it is not proof that the whole input is numeric.',
  'What does "5" + 2 evaluate to?',
  ["7", '"52"', "NaN"],
  1,
  "The string operand makes + perform concatenation.",
  "Write addInputs(a, b). Convert both numeric strings to numbers and return their sum. Inputs are valid numeric strings.",
  "function addInputs(a, b) {\n  // Convert before adding.\n}",
  "function addInputs(a, b) { return Number(a) + Number(b); }",
  [
    t("Whole numbers", 'addInputs("5","2")', 7),
    t("Decimals", 'addInputs("1.5","2.25")', 3.75),
    t("Negative values", 'addInputs("-4","1")', -3),
  ],
  [
    "When should you use ?? instead of ||?",
    "Use ?? when only null and undefined mean missing. It preserves valid values such as 0, false, and the empty string.",
  ],
);
add(
  "flow",
  0,
  "Decisions & control flow",
  25,
  "Translate a rule into branches, and make every boundary intentional.",
  [
    [
      "Conditions choose a path",
      'An if statement evaluates a condition, converts it to a boolean, and chooses a branch. Falsy values include false, 0, -0, 0n, "", null, undefined, and NaN. Arrays and objects are truthy, even when empty. Do not confuse an empty collection with a missing value.',
    ],
    [
      "Order matters",
      "An if / else if chain stops at the first matching branch. Put more specific or higher thresholds before broader ones. For score bands, testing score >= 50 before score >= 80 hides the higher band. Write down boundary cases before implementing the rule.",
    ],
    [
      "Guard clauses reduce nesting",
      "A guard returns early when an input is invalid or a special case applies. It lets the main path read straight down the page. The conditional operator condition ? a : b is useful for a short expression; deeply nested conditional expressions are usually harder to maintain.",
    ],
  ],
  "function canEnter(age, hasTicket) {\n  if (!hasTicket) return false;\n  return age >= 18;\n}\nconsole.log(canEnter(18, true));",
  "The guard handles a missing ticket first. The remaining expression already produces a boolean, so there is no need for return condition ? true : false.",
  "[] is truthy. To check whether an array contains elements, inspect its length.",
  "Why check score >= 80 before score >= 50 in an else-if chain?",
  [
    "JavaScript sorts the conditions",
    "The first matching branch wins",
    "Comparisons cannot be combined",
  ],
  1,
  "If the >= 50 branch comes first, a score of 90 enters it and never reaches the higher threshold.",
  'Write grade(score): return "A" for 80 or above, "B" for 60–79, "C" for 50–59, and "F" below 50.',
  "function grade(score) {\n  // Check thresholds from highest to lowest.\n}",
  'function grade(score) { if(score>=80) return "A"; if(score>=60) return "B"; if(score>=50) return "C"; return "F"; }',
  [
    t("Upper boundary", "grade(80)", "A"),
    t("Middle band", "grade(79)", "B"),
    t("Pass boundary", "grade(50)", "C"),
    t("Below pass", "grade(49)", "F"),
  ],
  [
    "What is a guard clause?",
    "An early return (or throw) that handles an exceptional or special case before the main path, reducing nested branches.",
  ],
);
add(
  "loops",
  0,
  "Loops & algorithmic thinking",
  30,
  "An algorithm is a precise sequence of steps. Learn to track what changes and what stays true.",
  [
    [
      "Choose the unit of iteration",
      "Use for...of for values in an iterable such as an array or string. Use a counted for loop when you need positions or a numeric range. for...in enumerates property names and is usually the wrong choice for array values. A while loop repeats while its condition remains truthy.",
    ],
    [
      "Establish an invariant",
      "An invariant is something true before and after every iteration. To sum a list, keep total equal to the sum of the values processed so far. Start total at zero; each iteration adds the next value. This way of reasoning scales from basic loops to search and sorting algorithms.",
    ],
    [
      "Count the work",
      "A single pass over n values is O(n) time. A nested loop that compares every pair is usually O(n²). These describe growth, not exact runtime. Always check the empty input and the last iteration: off-by-one errors commonly come from <= where < was intended.",
    ],
  ],
  "function sum(values) {\n  let total = 0;\n  for (const value of values) {\n    total += value;\n  }\n  return total;\n}",
  "Before the loop, no values have been processed and total is zero. After each pass, total covers exactly the processed prefix.",
  "An infinite loop can freeze a page. The practice runner uses a separate worker and stops long-running JavaScript after a timeout.",
  "How many times does for (let i = 0; i < 3; i++) run?",
  ["2", "3", "4"],
  1,
  "It runs for i = 0, 1, and 2. At 3 the condition is false.",
  "Write sumEven(values). Return the sum of all even integers in the array. Return 0 for an empty array.",
  "function sumEven(values) {\n  let total = 0;\n  // Add only even values.\n  return total;\n}",
  "function sumEven(values) { let total=0; for(const v of values) if(v%2===0) total+=v; return total; }",
  [
    t("Mixed integers", "sumEven([1,2,3,4])", 6),
    t("Empty collection", "sumEven([])", 0),
    t("Negative even values", "sumEven([-4,-3,2])", -2),
  ],
  [
    "What does O(n) mean for a loop?",
    "The amount of work grows roughly in proportion to the input size. Doubling n roughly doubles that part of the work.",
  ],
);
add(
  "functions",
  1,
  "Functions, scope & closures",
  35,
  "Functions are values, and they remember the environment in which they were created.",
  [
    [
      "Scope follows the source code",
      "Lexical scope means access is determined by where code is written, not where a function happens to be called. let and const are block-scoped. A function can read its own local variables and variables from enclosing scopes, but outer code cannot read its internal locals.",
    ],
    [
      "A closure retains access",
      "When a function is returned from another function, it can still access the outer function’s bindings. The enclosing call has finished, but those bindings stay reachable. Each call to the outer function creates a distinct environment. This supports configuration, private state, and event handlers.",
    ],
    [
      "Keep effects visible",
      "A pure function depends only on its inputs and does not mutate external state. A closure can be pure (a configured multiplier) or stateful (a counter). Both are useful. Prefer pure calculations for rules and isolate state changes at clear boundaries.",
    ],
  ],
  "function makeCounter() {\n  let count = 0;\n  return () => ++count;\n}\nconst next = makeCounter();\nconsole.log(next(), next()); // 1 2",
  "The returned function retains access to the same count binding. A second makeCounter() call would create an independent count.",
  "Closures capture bindings, not a frozen snapshot of each value. Changes to the captured binding can be observed later.",
  "Two separate calls to makeCounter() produce…",
  [
    "One shared count automatically",
    "Independent count bindings",
    "A syntax error",
  ],
  1,
  "Each function invocation creates its own lexical environment.",
  "Write makeMultiplier(factor). Return a function that multiplies its argument by factor.",
  "function makeMultiplier(factor) {\n  // Return a function.\n}",
  "function makeMultiplier(factor) { return value => value * factor; }",
  [
    t("Double", "makeMultiplier(2)(7)", 14),
    t("Negative factor", "makeMultiplier(-3)(4)", -12),
    t(
      "Independent closures",
      "[makeMultiplier(2)(3), makeMultiplier(5)(3)]",
      [6, 15],
    ),
  ],
  [
    "What is a closure?",
    "A function together with access to its surrounding lexical environment, even after the enclosing call has returned.",
  ],
);
add(
  "arrays",
  1,
  "Array transformations",
  35,
  "Express a data pipeline as a sequence of small transformations.",
  [
    [
      "Three tools, three questions",
      "map asks: what should each item become? filter asks: which items should remain? reduce asks: how can the items be combined into one result? map and filter return new arrays, though the objects inside may still be shared references. Choose the method that communicates your intent.",
    ],
    [
      "Keep callbacks focused",
      'A callback is a function supplied to another function. Array methods pass the current item, index, and array. Beware of passing a function that interprets those extra arguments differently: ["10", "10"].map(parseInt) is a classic trap because the index becomes the radix.',
    ],
    [
      "Empty arrays are real inputs",
      "map and filter naturally produce [] from []. reduce should usually receive an initial accumulator so an empty array is well-defined. Array.sort mutates its array and uses string ordering by default. Use a numeric comparator and copy first when preserving the input matters.",
    ],
  ],
  "const prices = [20, 5, 12];\nconst total = prices\n  .filter(price => price >= 10)\n  .map(price => price * 2)\n  .reduce((sum, price) => sum + price, 0);\nconsole.log(total); // 64",
  "The pipeline keeps 20 and 12, doubles them to 40 and 24, then adds them starting from zero.",
  "sort() compares strings by default: [2, 10].sort() becomes [10, 2]. Use (a, b) => a - b for ascending numbers.",
  "Which method selects a subset without changing the original array?",
  ["filter", "push", "splice"],
  0,
  "filter creates a new array containing the items whose predicate returns truthy.",
  "Write totalPositive(values). Use an array pipeline to sum only numbers greater than zero.",
  "function totalPositive(values) {\n  // Filter, then reduce with an initial value.\n}",
  "function totalPositive(values) { return values.filter(v=>v>0).reduce((sum,v)=>sum+v,0); }",
  [
    t("Mixed values", "totalPositive([-3,5,0,2])", 7),
    t("Empty array", "totalPositive([])", 0),
    t("All negative", "totalPositive([-1,-2])", 0),
  ],
  [
    "Why provide an initial value to reduce?",
    "It defines the accumulator type and the result for an empty array. Without it, reducing an empty array throws.",
  ],
);
add(
  "objects",
  1,
  "Objects, references & copying",
  35,
  "Understand identity and shared references before they turn into hard-to-find bugs.",
  [
    [
      "Properties group related information",
      "An object stores properties by string or symbol key. Dot notation is convenient for fixed names; brackets support dynamic keys. Destructuring binds selected properties to local names. A missing property evaluates to undefined, which is different from a property explicitly containing null.",
    ],
    [
      "Assignment shares identity",
      "Assigning an object to another variable copies a reference, not the object itself. Both variables can then reach the same object. === on objects compares identity. Two separate objects containing the same properties are still different objects.",
    ],
    [
      "Copy at the level you change",
      "Object spread creates a shallow copy. Nested objects are shared unless you copy them too. For state updates, copy every object on the path to the changed property. structuredClone supports many data types and cycles, but cannot clone functions and is not a universal object serializer.",
    ],
  ],
  'const user = {name: "Ada", stats: {score: 10}};\nconst next = {\n  ...user,\n  stats: {...user.stats, score: 11}\n};\nconsole.log(user.stats.score); // 10',
  "Both the outer user and nested stats object are copied, so the update does not affect the old state.",
  "{...object} is shallow. Mutating a nested object in the copy may still mutate the original.",
  "What is {} === {}?",
  [
    "true, because both are empty",
    "false, because they are different objects",
    "undefined",
  ],
  1,
  "Object equality uses identity, not a structural comparison of properties.",
  "Write renameUser(user, name). Return a new object with the updated name, preserve other properties, and do not mutate user.",
  "function renameUser(user, name) {\n  // Copy existing properties, then override name.\n}",
  "function renameUser(user,name) { return {...user,name}; }",
  [
    t("Update a property", 'renameUser({name:"Ada",score:4},"Tobi")', {
      name: "Tobi",
      score: 4,
    }),
    t(
      "Preserve the input",
      '(()=>{const u={name:"Ada"}; renameUser(u,"Tobi"); return u.name;})()',
      "Ada",
    ),
    t(
      "New identity",
      '(()=>{const u={}; return renameUser(u,"A")!==u;})()',
      true,
    ),
  ],
  [
    "What does a shallow copy share?",
    "It creates a new outer object but copies references to nested objects. The nested objects are still shared.",
  ],
);
add(
  "collections",
  1,
  "Maps, sets & efficient lookup",
  30,
  "Choose a data structure by the questions your program asks most often.",
  [
    [
      "Membership versus association",
      "A Set holds unique values and supports membership checks with has. A Map associates keys with values and supports set, get, and has. Unlike ordinary object properties, Map keys can be objects. Both preserve insertion order, which makes their iteration predictable.",
    ],
    [
      "Count with one pass",
      "A frequency table maps each value to its occurrence count. Read the old count, use zero when it is absent, and add one. The result supports fast questions about duplicates or popularity without repeatedly scanning the original input.",
    ],
    [
      "Know the equality rule",
      "Map and Set use SameValueZero equality: NaN matches NaN and -0 matches 0. Objects still compare by identity. Putting two separately created {id: 1} objects in a Set will keep both; deduplicating by id requires extracting the id or using a keyed Map.",
    ],
  ],
  'const counts = new Map();\nfor (const word of ["go", "learn", "go"]) {\n  counts.set(word, (counts.get(word) ?? 0) + 1);\n}\nconsole.log(counts.get("go")); // 2',
  "Each word updates one entry. The fallback is used only while a key has no count.",
  "A Set of objects removes repeated references, not separate objects with equal-looking properties.",
  "new Set([1, 1, 2]).size is…",
  ["2", "3", "1"],
  0,
  "Sets keep unique values, so the duplicate 1 is stored only once.",
  "Write unique(values). Return an array with duplicate primitive values removed, preserving first-seen order.",
  "function unique(values) {\n  // A Set is iterable.\n}",
  "function unique(values) { return [...new Set(values)]; }",
  [
    t("Repeated numbers", "unique([3,1,3,2,1])", [3, 1, 2]),
    t("Strings", 'unique(["js","cs","js"])', ["js", "cs"]),
    t("Empty input", "unique([])", []),
  ],
  [
    "When is Map preferable to an object?",
    "When you need arbitrary key types, clear key membership, frequent insertion/removal, or an iterable collection of entries.",
  ],
);
add(
  "errors",
  2,
  "Errors, validation & debugging",
  35,
  "Treat failures as part of the contract, and debug by forming and testing a hypothesis.",
  [
    [
      "Validate at the boundary",
      "External data is not trustworthy just because a form field looks correct. Validate where data enters the system. A useful function contract states valid inputs, returned values, and failure behavior. Throw an Error subclass for an operation that cannot fulfill its contract.",
    ],
    [
      "Catch where you can act",
      "try/catch handles synchronous throws and rejections from awaited promises inside the try block. Catch an error when you can recover, add useful context, or display it at a boundary. Silently catching and returning undefined hides the failure from the caller.",
    ],
    [
      "Debug systematically",
      "Reproduce the smallest failing case. State what you expected, what happened, and a hypothesis about the difference. Inspect values or pause at a breakpoint to test that hypothesis. A stack trace tells you the call path to the failure; read the first relevant frame in your code.",
    ],
  ],
  'function divide(a, b) {\n  if (b === 0) throw new RangeError("Divisor must not be zero");\n  return a / b;\n}\ntry { divide(4, 0); }\ncatch (error) { console.log(error.message); }',
  "The function refuses an invalid divisor. The boundary decides how to present the message.",
  "try/catch around a call does not catch a later asynchronous failure unless you await the promise inside the try block.",
  "Where is a good place to catch an error?",
  [
    "Every line, then ignore it",
    "At a boundary that can recover or present the failure",
    "Nowhere; all errors are bugs",
  ],
  1,
  "Catching is useful when you can do something meaningful with the failure.",
  "Write safeParse(text). Parse JSON and return its value. Return null when parsing throws.",
  "function safeParse(text) {\n  // Use JSON.parse inside try/catch.\n}",
  "function safeParse(text) { try { return JSON.parse(text); } catch { return null; } }",
  [
    t("Valid object", "safeParse('{\"score\":4}')", { score: 4 }),
    t("Invalid JSON", 'safeParse("oops")', null),
    t("Valid false value", 'safeParse("false")', false),
  ],
  [
    "What makes an error catch useful?",
    "It recovers, adds context, or presents the failure at an appropriate boundary. Silently swallowing an error obscures the cause.",
  ],
);
add(
  "async",
  2,
  "Promises & async / await",
  40,
  "Model a result that arrives later without pretending the work is already finished.",
  [
    [
      "A promise represents an eventual outcome",
      "A promise is pending, fulfilled, or rejected. It settles once. .then registers what to do with a fulfillment; .catch handles rejection. Returning from a then callback becomes the next promise’s value, which lets operations form a chain.",
    ],
    [
      "await suspends the async function",
      "An async function always returns a promise. await waits for a value or promise, suspends the current async function, and lets other work proceed. A rejected awaited promise behaves like a throw at that point, so ordinary try/catch can handle it.",
    ],
    [
      "Sequence only when necessary",
      "If B needs the result of A, await A first. If A and B are independent, start both and use Promise.all. Promise.all preserves input order in its results and rejects when any input rejects; it does not cancel other running operations.",
    ],
  ],
  "async function doubleLater(value) {\n  const resolved = await Promise.resolve(value);\n  return resolved * 2;\n}\nconsole.log(await doubleLater(6)); // 12",
  "doubleLater returns a promise even though the work is simple. await extracts the fulfilled value inside the async flow.",
  "Array.forEach does not await async callbacks. Use for...of for sequential work or Promise.all(values.map(...)) for concurrency.",
  "What does an async function return?",
  ["Always a promise", "Always the raw return value", "Only undefined"],
  0,
  "Its return value is wrapped in a promise; thrown errors become rejections.",
  "Write async sumAsync(a, b). Accept values or promises, await both, and return their numeric sum.",
  "async function sumAsync(a, b) {\n  // Resolve both inputs.\n}",
  "async function sumAsync(a,b) { const [x,y]=await Promise.all([a,b]); return x+y; }",
  [
    t(
      "Promised inputs",
      "await sumAsync(Promise.resolve(3),Promise.resolve(4))",
      7,
    ),
    t("Plain inputs", "await sumAsync(2,8)", 10),
    t(
      "Rejection propagates",
      'await sumAsync(Promise.reject(new Error("stop")),1).then(()=>false,e=>e.message)',
      "stop",
    ),
  ],
  [
    "Does Promise.all cancel work after a rejection?",
    "No. It rejects its result, but already-started operations continue unless you separately arrange cancellation.",
  ],
);
add(
  "event-loop",
  2,
  "The event loop & scheduling",
  40,
  "Predict the order of synchronous code, promise reactions, and timer callbacks.",
  [
    [
      "The call stack runs first",
      "JavaScript executes the current synchronous work until it yields or finishes. A timer does not interrupt a running function. Blocking computation delays UI events and timers on the same thread. This is why long tasks can make an interface feel frozen.",
    ],
    [
      "Microtasks precede the next task",
      "After current synchronous work finishes, the microtask queue is drained before the next task. Promise reactions and queueMicrotask callbacks are microtasks. Timers enqueue tasks. Microtasks can schedule more microtasks, so excessive microtask chains can also starve rendering.",
    ],
    [
      "A delay is not a deadline",
      "setTimeout(fn, 0) means run no earlier than the timer permits and when the event loop is available. It does not mean run immediately. Browser rendering opportunities and background-tab throttling add more context. Design against completion signals instead of guessing a delay.",
    ],
  ],
  'console.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");',
  "The order is A, D, C, B: synchronous logs first, promise microtask next, timer task last. Use the full playground to experiment with timers; keep the async function alive by awaiting them.",
  "A zero-millisecond timer still waits for synchronous work and pending microtasks.",
  "In the example, what prints immediately after A?",
  ["B", "C", "D"],
  2,
  "D is synchronous and runs before either queued callback.",
  "Write async delayValue(value). Await a promise that resolves using setTimeout, then return value. Use a delay under 100 ms.",
  "async function delayValue(value) {\n  // Await a timer-backed promise.\n}",
  "async function delayValue(value) { await new Promise(resolve=>setTimeout(resolve,5)); return value; }",
  [
    t("Returns eventual string", 'await delayValue("ready")', "ready"),
    t("Preserves zero", "await delayValue(0)", 0),
    t("Returns a promise", "delayValue(1) instanceof Promise", true),
  ],
  [
    "What runs first: a pending promise reaction or a zero-delay timer?",
    "After current synchronous work, promise reactions run as microtasks before the next timer task.",
  ],
);
add(
  "http",
  2,
  "HTTP, fetch & resilient clients",
  40,
  "Separate network failures, HTTP failures, and invalid data.",
  [
    [
      "An HTTP response has layers",
      "A request combines a method, URL, headers, and optionally a body. The response includes a status, headers, and body. GET retrieves a representation; POST typically submits data. Status codes describe outcomes: 2xx success, 4xx client-side conditions, and 5xx server-side conditions.",
    ],
    [
      "fetch does not reject for every failure",
      "fetch rejects for network-level failures and aborts, but normally fulfills for HTTP 404 and 500 responses. Check response.ok before reading data. response.json() returns a promise and may reject if the body is not valid JSON. Successful parsing still does not validate the shape of the data.",
    ],
    [
      "Design for time and repetition",
      "Use AbortController to cancel an operation when it becomes irrelevant or exceeds a deadline. Retries need limits and backoff. Automatically retrying a non-idempotent operation can duplicate its effect, so understand the endpoint contract before retrying.",
    ],
  ],
  "async function loadUser(url) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  return await response.json();\n}",
  "There are two asynchronous stages: obtain the response, then read and parse its body. Exercises inject a fake fetch function so they work offline.",
  "A 404 response is usually a fulfilled fetch promise. You must explicitly inspect the HTTP status.",
  "fetch returns a 500 response. What happens by default?",
  [
    "The promise necessarily rejects",
    "The promise fulfills with a response",
    "The browser retries forever",
  ],
  1,
  "HTTP error statuses do not normally cause fetch itself to reject.",
  'Write async loadJson(fetcher). Call the provided fetcher, throw Error("HTTP " + status) if !response.ok, otherwise return response.json().',
  "async function loadJson(fetcher) {\n  // fetcher is provided, so no network is needed.\n}",
  'async function loadJson(fetcher) { const r=await fetcher(); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }',
  [
    t(
      "Successful JSON",
      "await loadJson(async()=>({ok:true,json:async()=>({id:7})}))",
      { id: 7 },
    ),
    t(
      "HTTP failure",
      'await loadJson(async()=>({ok:false,status:404})).then(()=>"missed",e=>e.message)',
      "HTTP 404",
    ),
    t(
      "Network rejection",
      'await loadJson(async()=>{throw new Error("offline")}).then(()=>"missed",e=>e.message)',
      "offline",
    ),
  ],
  [
    "Which failures must you distinguish when using fetch?",
    "Network/abort failures, unsuccessful HTTP statuses, body parsing failures, and invalid data shape are separate layers.",
  ],
);
add(
  "dom",
  3,
  "DOM, events & accessible interfaces",
  40,
  "Connect user actions to state changes without mixing all your logic into the page.",
  [
    [
      "The DOM is a tree of live objects",
      "The browser parses HTML into nodes. querySelector finds a matching element or returns null. textContent writes text; innerHTML parses markup. Build display strings as text when they contain user data. Keep the model of your application separate from the DOM that displays it.",
    ],
    [
      "Events travel through the tree",
      "An event can move through capture and bubble phases. event.target is where the event originated; event.currentTarget is the element whose listener is running. Event delegation attaches a listener to a common ancestor and identifies a matching child with closest.",
    ],
    [
      "Use the browser’s built-in semantics",
      "Use a button for an action and an anchor for navigation. A real button supports keyboard activation and disabled state without reinventing them. Every form control needs a visible label. Loading, empty, error, and success states are all parts of a complete interface.",
    ],
  ],
  '// Run DOM code in the DOM playground.\nconst button = document.querySelector("button");\nbutton.addEventListener("click", () => {\n  document.querySelector("output").textContent = "Hello!";\n});',
  "The browser owns the event loop and calls the listener when the button is activated. textContent treats the output as text.",
  "Never insert untrusted strings with innerHTML. The browser may interpret them as executable markup.",
  "Which property refers to the element where a listener is registered?",
  ["event.target", "event.currentTarget", "event.originalElement"],
  1,
  "target is the origin; currentTarget is the current listener’s element.",
  'Keep UI logic testable: write nextCount(current, action). Return current + 1 for "increment", Math.max(0, current - 1) for "decrement", 0 for "reset", and current for other actions.',
  "function nextCount(current, action) {\n  // This pure function can power a button interface.\n}",
  'function nextCount(c,a) { if(a==="increment")return c+1; if(a==="decrement")return Math.max(0,c-1); if(a==="reset")return 0; return c; }',
  [
    t("Increment", 'nextCount(3,"increment")', 4),
    t("Lower bound", 'nextCount(0,"decrement")', 0),
    t("Reset", 'nextCount(8,"reset")', 0),
    t("Unknown action", 'nextCount(2,"unknown")', 2),
  ],
  [
    "Why separate UI state transitions from DOM updates?",
    "Pure state transitions can be tested without a browser. The DOM layer then only reads inputs and renders the resulting state.",
  ],
);
add(
  "modules",
  3,
  "Modules & dependency boundaries",
  35,
  "Make a program easier to change by giving each part a clear responsibility.",
  [
    [
      "Export a small public surface",
      'An ES module uses export to expose bindings and import to consume them. Modules have their own top-level scope and run in strict mode. The browser uses type="module" and resolves imports as URLs. Node.js can use .mjs files or a package with type set to module.',
    ],
    [
      "Dependencies shape testability",
      "A function that directly reads a global clock or calls a real network service is harder to test. Pass a dependency as a parameter when you need control over that boundary. Production supplies the real implementation; a test supplies a small deterministic replacement.",
    ],
    [
      "Separate policy from plumbing",
      "Domain rules answer what the program should do. Adapters handle details such as HTTP, files, and the DOM. A pricing rule should not need to know how a button is rendered. This separation makes it possible to replace the interface without rewriting the rules.",
    ],
  ],
  '// pricing.js\nexport const tax = subtotal => subtotal * 0.075;\n\n// app.js\nimport { tax } from "./pricing.js";\nconsole.log(tax(100));',
  "Each module owns its scope. These are two files; use them in your project editor rather than pasting both into the single-file console runner.",
  "A circular import may expose a binding before initialization. Avoid cycles by extracting shared concepts into a lower-level module.",
  "Why inject a clock or a fetch function?",
  [
    "To hide the behavior",
    "To control external effects in tests",
    "To make every function asynchronous",
  ],
  1,
  "A supplied dependency lets tests choose predictable behavior without relying on external systems.",
  "Write stamp(message, clock). Return {message, time: clock()}. Use the injected clock exactly once.",
  "function stamp(message, clock) {\n  // The caller provides time.\n}",
  "function stamp(message,clock) { return {message,time:clock()}; }",
  [
    t("Controlled clock", 'stamp("saved",()=>123)', {
      message: "saved",
      time: 123,
    }),
    t("Zero timestamp", 'stamp("start",()=>0)', { message: "start", time: 0 }),
    t("Single clock call", '(()=>{let n=0;stamp("x",()=>++n);return n;})()', 1),
  ],
  [
    "What is dependency injection in plain language?",
    "Pass a component the things it needs, rather than making it locate or create them internally. This improves control and testability.",
  ],
);
add(
  "prototypes",
  3,
  "Prototypes, classes & this",
  40,
  "Learn the object model underneath JavaScript class syntax.",
  [
    [
      "Objects delegate property lookup",
      "When a property is not found directly on an object, JavaScript can search its prototype chain. A class declaration organizes constructor logic and prototype methods. It does not turn JavaScript into C#: the underlying model remains prototype-based.",
    ],
    [
      "this depends on the call",
      "In an ordinary function, this is determined by how the function is called. user.say() supplies user as this. Extracting the method and calling it separately loses that receiver. Arrow functions capture this lexically and cannot be rebound with call or bind.",
    ],
    [
      "State and invariants belong together",
      "A class is useful when operations need to preserve rules about state. Private fields prefixed with # enforce access through the class body. Prefer a plain object for simple data and pure functions for independent transformations; classes are a tool, not a requirement.",
    ],
  ],
  "class Counter {\n  #value = 0;\n  increment() { this.#value++; }\n  get value() { return this.#value; }\n}\nconst counter = new Counter();\ncounter.increment();\nconsole.log(counter.value);",
  "The private field is stored on the instance. Methods are shared through the prototype and operate on the receiver.",
  "Passing an unbound instance method as a callback can lose this. Bind it or wrap the call in an arrow function.",
  "Where do ordinary methods declared in a class body usually live?",
  [
    "On the class prototype",
    "As global functions",
    "Inside each numeric value",
  ],
  0,
  "Instances delegate method lookup to the prototype instead of each storing a separate method function.",
  "Create class Counter with a constructor(start = 0), an increment() method that adds one and returns the new value, and a value getter.",
  "class Counter {\n  constructor(start = 0) {\n    // Store the starting value.\n  }\n  increment() { }\n  get value() { }\n}",
  "class Counter { #n; constructor(start=0){this.#n=start;} increment(){return ++this.#n;} get value(){return this.#n;} }",
  [
    t("Default initial state", "new Counter().value", 0),
    t("Increment", "(()=>{const c=new Counter(4);return c.increment();})()", 5),
    t(
      "Separate instances",
      "(()=>{const a=new Counter(),b=new Counter();a.increment();return b.value;})()",
      0,
    ),
  ],
  [
    "How does an arrow function get this?",
    "It captures this from the surrounding lexical scope. call, apply, and bind do not replace an arrow function’s this.",
  ],
);
add(
  "testing",
  3,
  "Testing & behavioral contracts",
  40,
  "A useful test protects a behavior, including the cases you are likely to forget.",
  [
    [
      "Arrange, act, assert",
      "Arrange the inputs, act by calling the behavior, and assert the observable result. A test should communicate a requirement rather than mirror every implementation detail. Tests for empty input, boundaries, and failure cases often find more bugs than another ordinary example.",
    ],
    [
      "Determinism makes failures useful",
      "A deterministic test gets the same result under the same inputs. Inject clocks, randomness, and I/O. Unit tests isolate rules; integration tests verify cooperating parts; end-to-end tests verify a user journey. Each layer catches a different kind of mistake and has a different maintenance cost.",
    ],
    [
      "Fix a bug with a regression test",
      "Start with a case that reproduces the bug and fails for the right reason. Make the smallest useful fix, then confirm the test passes. A passing test does not prove correctness for all possible inputs, so choose representative classes of inputs and explain your contract.",
    ],
  ],
  "function assertEqual(actual, expected) {\n  if (actual !== expected) {\n    throw new Error(`Expected ${expected}; got ${actual}`);\n  }\n}\nassertEqual(Math.max(1, 3), 3);",
  "The assertion says what result is required. Frameworks automate reporting, setup, and richer assertions around this same idea.",
  "Do not write tests that only check that a function exists. Test what a caller needs the function to do.",
  "Which test best guards an off-by-one error in an age >= 18 rule?",
  ["Age 40", "Age 18 and age 17", "The function name"],
  1,
  "The values directly on either side of the boundary distinguish >= from >.",
  "Write clamp(value, min, max). Restrict value to the inclusive range. Assume min <= max.",
  "function clamp(value, min, max) {\n  // Handle values below, inside, and above the range.\n}",
  "function clamp(value,min,max){return Math.min(max,Math.max(min,value));}",
  [
    t("Below range", "clamp(-2,0,10)", 0),
    t("Inside range", "clamp(4,0,10)", 4),
    t("Above range", "clamp(12,0,10)", 10),
    t("Single-value range", "clamp(9,3,3)", 3),
  ],
  [
    "What is a regression test?",
    "A test that reproduces a previously fixed bug, so the same behavior cannot silently break again.",
  ],
);
add(
  "algorithms",
  4,
  "Algorithms & complexity",
  45,
  "Choose algorithms by their assumptions and growth, then prove the edge cases.",
  [
    [
      "Search is a tradeoff",
      "Linear search examines items until it finds a match and works on unsorted data. Binary search repeatedly discards half a sorted search range. It needs a stable ordering. Faster searching may require preprocessing, extra memory, or maintaining order when data changes.",
    ],
    [
      "State the interval convention",
      "For binary search, use an inclusive interval [low, high] or a half-open interval [low, high), and stay consistent. Compute the midpoint, compare, then discard the midpoint along with the impossible half. If neither bound moves, the loop can run forever.",
    ],
    [
      "Consider both time and space",
      "Binary search takes O(log n) comparisons and O(1) extra space in an iterative implementation. Sorting first takes additional time. A Map may offer convenient lookup but consumes extra memory. The best choice depends on input size and how frequently reads and writes occur.",
    ],
  ],
  "// Inclusive bounds: low and high are candidate positions.\nlet low = 0;\nlet high = values.length - 1;\n// While low <= high, inspect the midpoint\n// and shrink the remaining candidate interval.",
  "The empty array starts with high = -1, so the search loop never executes and the not-found result is immediate.",
  "Binary search only works with the ordering its comparisons assume. Sorting an array elsewhere can also change indices the caller expects.",
  "Binary search on a sorted array has what time complexity?",
  ["O(n²)", "O(log n)", "O(n!)"],
  1,
  "Each comparison cuts the candidate range roughly in half.",
  "Write binarySearch(values, target). Values are unique numbers sorted ascending. Return the index of target, or -1 if absent.",
  "function binarySearch(values, target) {\n  let low = 0, high = values.length - 1;\n  // Narrow the inclusive interval.\n  return -1;\n}",
  "function binarySearch(a,t){let lo=0,hi=a.length-1;while(lo<=hi){const m=Math.floor((lo+hi)/2);if(a[m]===t)return m;if(a[m]<t)lo=m+1;else hi=m-1;}return -1;}",
  [
    t("Middle value", "binarySearch([1,3,5,7,9],5)", 2),
    t("First value", "binarySearch([1,3,5],1)", 0),
    t("Missing", "binarySearch([1,3,5],4)", -1),
    t("Empty", "binarySearch([],1)", -1),
  ],
  [
    "What must be true before binary search is valid?",
    "The collection must be ordered according to the comparison used by the search, and that ordering must remain stable during the search.",
  ],
);
add(
  "state",
  4,
  "State, reducers & persistence",
  40,
  "Make state changes explicit and store only what you can safely restore.",
  [
    [
      "State is data that changes over time",
      "A reducer maps current state and an action to next state. It centralizes transition rules and is easiest to test when pure. Derived values, such as a total calculated from items, usually should be computed from the source state instead of stored redundantly.",
    ],
    [
      "Immutability makes change visible",
      "Return a new object for a change, copying the nested parts you modify. This preserves old snapshots and makes undo or comparison easier. For an unknown action, returning the same state is often reasonable. Immutability is a design discipline, not something const guarantees.",
    ],
    [
      "Persistence is a boundary",
      "localStorage stores strings and is synchronous. JSON serialization drops some JavaScript values and cannot encode circular references. Storage may be unavailable or full. Parse with error handling, validate the shape, and version saved data so future changes can be migrated.",
    ],
  ],
  'function reducer(state, action) {\n  if (action.type === "rename") {\n    return {...state, name: action.name};\n  }\n  return state;\n}',
  "The reducer returns a new snapshot for a supported change while leaving the original untouched.",
  "Local storage is readable by scripts on the same origin. It is not a secure place for secrets.",
  "Which is usually better stored as derived data?",
  [
    "The individual cart items",
    "The sum of the current cart item prices",
    "The user’s typed name",
  ],
  1,
  "The total can be recalculated from the items, avoiding two stored facts that can disagree.",
  "Write cartTotal(items). Each item has price and quantity. Return the sum of price * quantity without mutating the items.",
  "function cartTotal(items) {\n  // Start the total at zero.\n}",
  "function cartTotal(items){return items.reduce((s,x)=>s+x.price*x.quantity,0);}",
  [
    t(
      "Multiple items",
      "cartTotal([{price:10,quantity:2},{price:5,quantity:3}])",
      35,
    ),
    t("Empty cart", "cartTotal([])", 0),
    t("Zero quantity", "cartTotal([{price:8,quantity:0}])", 0),
  ],
  [
    "Why version persisted state?",
    "The shape of saved data outlives a page load and may outlive an app update. A version lets you validate or migrate older data deliberately.",
  ],
);
add(
  "security",
  4,
  "Security at the input boundary",
  40,
  "Understand where text becomes instructions and keep untrusted data out of that transition.",
  [
    [
      "Injection crosses a trust boundary",
      "HTML, SQL, shell commands, and JavaScript are languages with executable meaning. A string that is harmless as data can become dangerous when interpreted as code. Prefer APIs that keep data separate: textContent for text, parameterized SQL for database values, and argument arrays for process invocation.",
    ],
    [
      "Validation and escaping differ",
      "Validation checks whether a value meets the application’s rules. Escaping encodes a value for a specific output context. HTML text escaping is different from safe URL handling or JavaScript string encoding. There is no universal sanitize function that makes a string safe everywhere.",
    ],
    [
      "Client checks improve UX, server checks enforce rules",
      "A caller can bypass browser validation. The server must validate inputs and authorize each operation. Authentication asks who you are; authorization asks what you may do. Secrets embedded in frontend JavaScript are visible to users and should not be treated as confidential.",
    ],
  ],
  "// For ordinary user-visible text:\nelement.textContent = userInput;\n// Avoid: element.innerHTML = userInput;\n\n// Validate a quantity separately:\nconst valid = Number.isInteger(quantity) && quantity >= 0;",
  "Displaying text safely and validating a business rule solve different problems. Prefer the appropriate API over handcrafted escaping.",
  "Escaping for HTML text does not make a value safe as a URL, CSS, SQL, or script fragment.",
  "Where must authorization be enforced?",
  [
    "Only in hidden frontend buttons",
    "On the server for each protected operation",
    "Only in CSS",
  ],
  1,
  "A user can call an endpoint without using your interface, so the server must enforce access.",
  "For understanding HTML text only, write escapeText(text). Replace &, <, >, double quote, and single quote with &amp;, &lt;, &gt;, &quot;, and &#39;. This is not a general sanitizer.",
  "function escapeText(text) {\n  // A replacement map avoids double-escaping.\n}",
  'function escapeText(text){const m={"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"};return text.replace(/[&<>"\']/g,c=>m[c]);}',
  [
    t(
      "Markup characters",
      'escapeText("<b>&</b>")',
      "&lt;b&gt;&amp;&lt;/b&gt;",
    ),
    t("Plain text", 'escapeText("Hello")', "Hello"),
    t("Quotes", "escapeText(`\"'`)", "&quot;&#39;"),
  ],
  [
    "How do validation and escaping differ?",
    "Validation checks application rules for input. Escaping encodes data for one particular output context; it is not a universal safety guarantee.",
  ],
);
add(
  "architecture",
  4,
  "Ship a maintainable application",
  50,
  "Turn individual language features into a system that survives changing requirements.",
  [
    [
      "Start with a thin vertical slice",
      "Build one user journey end to end: input, validation, a domain operation, persistence, and feedback. A small working slice reveals integration problems early. Add features incrementally, keeping each part understandable and executable.",
    ],
    [
      "Name contracts, not accidents",
      "Write down what each boundary accepts and returns, including errors. Normalize data at those boundaries. Keep domain functions independent from UI and transport. Avoid speculative abstractions: duplicate a small amount until the shared concept is understood, then extract it.",
    ],
    [
      "Measure and observe",
      "When something feels slow, measure before optimizing. Add enough context to errors to reproduce them, but avoid logging secrets. A release checklist includes error states, keyboard use, data recovery, and a path to undo a bad change. Maintainability includes how a future person diagnoses failures.",
    ],
  ],
  "function summarizeOrders(orders) {\n  return orders.reduce((summary, order) => ({\n    count: summary.count + 1,\n    total: summary.total + order.amount\n  }), {count: 0, total: 0});\n}",
  "This domain function has no dependency on a page, framework, or network. Multiple interfaces can call the same tested rule.",
  "A large framework does not automatically create good boundaries. Responsibility and dependency direction matter more than folder count.",
  "What is a vertical slice?",
  [
    "All database code before any UI",
    "One small user journey working through every needed layer",
    "A list of future dependencies",
  ],
  1,
  "A vertical slice delivers observable behavior across the layers needed for that behavior.",
  'Write summarizeOrders(orders). Include only orders with status === "paid". Return {count, total}, summing their amount values.',
  "function summarizeOrders(orders) {\n  // Separate selection from aggregation.\n}",
  'function summarizeOrders(orders){return orders.filter(o=>o.status==="paid").reduce((s,o)=>({count:s.count+1,total:s.total+o.amount}),{count:0,total:0});}',
  [
    t(
      "Mixed order states",
      'summarizeOrders([{status:"paid",amount:10},{status:"pending",amount:90},{status:"paid",amount:5}])',
      { count: 2, total: 15 },
    ),
    t("No orders", "summarizeOrders([])", { count: 0, total: 0 }),
    t("No paid orders", 'summarizeOrders([{status:"cancelled",amount:3}])', {
      count: 0,
      total: 0,
    }),
  ],
  [
    "Why keep domain rules independent of UI and transport?",
    "You can test the rules directly and reuse them when the interface, framework, or network layer changes.",
  ],
);
export default lessons;
