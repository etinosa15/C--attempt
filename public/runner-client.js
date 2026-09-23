// Refresh the connection before each run. Retry only an explicit rejection:
// a disconnected or timed-out POST may already have executed the learner's code.
export function createRunnerClient({
  fetchImpl = (...args) => fetch(...args),
  statusTimeoutMs = 5000,
  runTimeoutMs = 30000,
  onStatus = () => {},
} = {}) {
  async function request(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Invalid runner response.");
      return { response, data };
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          url === "/api/run"
            ? "The runner did not respond within 30 seconds. Your program may have run. Check the server, then try again when ready."
            : "The local runner took too long to connect. Start Forge, then click Run code or Check solution again.",
        );
      if (error instanceof SyntaxError || error.message === "Invalid runner response.")
        throw new Error("The local runner returned an invalid response. Check that Forge is running, then try again.");
      throw new Error("Could not reach the local runner. Start or restart Forge, then click Run code or Check solution again.");
    } finally {
      // Include reading the response body in the deadline.
      clearTimeout(timer);
    }
  }

  async function getStatus() {
    const { response, data } = await request("/api/status", {}, statusTimeoutMs);
    if (!response.ok)
      throw new Error(data.error || `The local runner returned HTTP ${response.status}.`);
    if (typeof data.token !== "string" || !data.token || typeof data.csharp !== "boolean")
      throw new Error("The local runner returned an invalid status. Restart Forge and try again.");
    onStatus(data);
    return data;
  }

  async function run(code, lessonId) {
    const body = JSON.stringify({ code, lessonId });
    for (let attempt = 0; attempt < 2; attempt++) {
      const status = await getStatus();
      const { response, data } = await request("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forge-Token": status.token,
        },
        body,
      }, runTimeoutMs);
      // Forge rejects 403 requests before executing any code. The server may
      // have restarted between the status request and submission.
      if (response.status === 403 && attempt === 0) continue;
      if (!response.ok)
        throw new Error(data.error || `The local runner returned HTTP ${response.status}.`);
      return data;
    }
  }

  return { getStatus, run };
}
