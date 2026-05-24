/*
  networkClient.js
  A lightweight HTTP-like client that can simulate:
  Random network failures (flakiness)
  Latency jitter
  Partial responses
  Retry-able 503s
 */

const { sleep } = require('./asyncHelpers');

class NetworkError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
  }
}

/**
 * Simulates a network GET request.
 
  @param {string} url
 * @param {object} options
 * @param {number} options.failRate      - 0–1 probability of failure per call
 * @param {number} options.minLatency    - minimum ms delay
 * @param {number} options.maxLatency    - maximum ms delay
 * @param {boolean} options.partial      - return truncated response
 */
async function networkGet(url, options = {}) {
  const {
    failRate = 0,
    minLatency = 10,
    maxLatency = 50,
    partial = false,
  } = options;

  // Simulate network latency jitter
  const latency = minLatency + Math.random() * (maxLatency - minLatency);
  await sleep(latency);

  // Simulate random network failure
  if (Math.random() < failRate) {
    const codes = [500, 502, 503, 504];
    const code = codes[Math.floor(Math.random() * codes.length)];
    throw new NetworkError(`Network failure for ${url}`, code);
  }

  const body = { url, data: `response-from-${url}`, timestamp: Date.now() };

  if (partial) {
    // Return incomplete / truncated data to test parsing guards
    return { status: 200, body: { url } }; // missing `data` and `timestamp`
  }

  return { status: 200, body };
}

/*
 Simulates a POST that occasionally returns 429 (rate limit).
 */
async function networkPost(url, payload, options = {}) {
  const { rateLimitRate = 0, minLatency = 20, maxLatency = 80 } = options;

  const latency = minLatency + Math.random() * (maxLatency - minLatency);
  await sleep(latency);

  if (Math.random() < rateLimitRate) {
    throw new NetworkError('Rate limited', 429);
  }

  return { status: 201, body: { ...payload, id: Math.random().toString(36).slice(2) } };
}

/*
  DNS-style resolution — occasionally fails to resolve.
 */
async function resolveHost(hostname, failRate = 0) {
  await sleep(5 + Math.random() * 15);
  if (Math.random() < failRate) {
    throw new NetworkError(`ENOTFOUND ${hostname}`, 0);
  }
  return `10.0.0.${Math.floor(Math.random() * 254) + 1}`;
}

module.exports = { networkGet, networkPost, resolveHost, NetworkError };
