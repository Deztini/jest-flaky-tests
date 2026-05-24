/*
 retryManager.js
 Wraps any async operation with configurable retry logic:
 Max attempts
 Exponential / fixed / jittered backoff
 Selective retry (only certain error codes / types)
 */

const { sleep } = require('./asyncHelpers');

const BackoffStrategy = {
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential',
  JITTER: 'jitter',
};

/**
 * @param {Function} fn           - async function to retry
 * @param {object}   config
 * @param {number}   config.maxAttempts
 * @param {number}   config.baseDelay       - ms
 * @param {string}   config.strategy        - BackoffStrategy value
 * @param {Function} config.shouldRetry     - (err) => boolean
 */
async function retry(fn, config = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    strategy = BackoffStrategy.EXPONENTIAL,
    shouldRetry = () => true,
  } = config;

  const attempts = [];
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    try {
      const result = await fn();
      attempts.push({ attempt, success: true, duration: Date.now() - start });
      return { result, attempts };
    } catch (err) {
      attempts.push({ attempt, success: false, duration: Date.now() - start, error: err.message });
      lastErr = err;

      if (!shouldRetry(err) || attempt === maxAttempts) break;

      let delay;
      switch (strategy) {
        case BackoffStrategy.FIXED:
          delay = baseDelay;
          break;
        case BackoffStrategy.EXPONENTIAL:
          delay = baseDelay * 2 ** (attempt - 1);
          break;
        case BackoffStrategy.JITTER:
          delay = baseDelay * 2 ** (attempt - 1) * (0.5 + Math.random() * 0.5);
          break;
        default:
          delay = baseDelay;
      }

      await sleep(delay);
    }
  }

  const error = new Error(`Failed after ${maxAttempts} attempts: ${lastErr.message}`);
  error.cause = lastErr;
  error.attempts = attempts;
  throw error;
}

module.exports = { retry, BackoffStrategy };
