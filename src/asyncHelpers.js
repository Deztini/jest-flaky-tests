/*
  Simulates a real async delay using a Promise + setTimeout.
  Truly async — not blocking, yields to event loop.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
  Fetches data with an artificial async delay.
  Rejects if the id is invalid.
 */
async function fetchUser(id) {
  await sleep(50);
  if (!id || typeof id !== 'number') {
    throw new Error('Invalid user ID');
  }
  return { id, name: `User_${id}`, active: true };
}

/*
  Async function that resolves after multiple await hops.
  Tests that multi-hop async chains are awaited correctly.
 */
async function processQueue(items) {
  const results = [];
  for (const item of items) {
    await sleep(10); // simulate per-item async work
    results.push({ item, processed: true, ts: Date.now() });
  }
  return results;
}

/*
  Returns a Promise that rejects after a timeout.
  Used to test timeout-handling logic.
 */
function fetchWithTimeout(fn, ms) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/*
  Event-emitter-style async function — resolves when the emitter fires 'done'.
 */
function waitForEvent(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once('error', reject);
  });
}

/*
  Retries an async function up to `retries` times with exponential backoff.
 */
async function withRetry(fn, retries = 3, baseDelay = 50) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(baseDelay * 2 ** attempt);
      }
    }
  }
  throw lastErr;
}

module.exports = { sleep, fetchUser, processQueue, fetchWithTimeout, waitForEvent, withRetry };
