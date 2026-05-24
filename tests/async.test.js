'use strict';

const { EventEmitter } = require('events');
const {
  sleep,
  fetchUser,
  processQueue,
  fetchWithTimeout,
  waitForEvent,
  withRetry,
} = require('../src/asyncHelpers');

// STABLE ASYNC TESTS

describe('Async - stable tests', () => {
  it('sleep resolves with undefined', async () => {
    const result = await sleep(5);
    expect(result).toBeUndefined();
  });

  it('sleep resolves after approximately the given delay', async () => {
    const start = Date.now();
    await sleep(80);
    expect(Date.now() - start).toBeGreaterThanOrEqual(70);
  });

  it('multiple concurrent sleeps all resolve', async () => {
    const results = await Promise.all([sleep(10), sleep(20), sleep(30)]);
    expect(results).toHaveLength(3);
  });

  it('fetchUser returns the correct shape for a valid id', async () => {
    const user = await fetchUser(42);
    expect(user).toMatchObject({ id: 42, name: 'User_42', active: true });
  });

  it('fetchUser rejects for a null id', async () => {
    await expect(fetchUser(null)).rejects.toThrow('Invalid user ID');
  });

  it('fetchUser rejects for a string id', async () => {
    await expect(fetchUser('abc')).rejects.toThrow('Invalid user ID');
  });

  it('concurrent fetchUser calls resolve independently', async () => {
    const users = await Promise.all([fetchUser(1), fetchUser(2), fetchUser(3)]);
    expect(users.map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it('Promise.allSettled contains both fulfilled and rejected fetchUser results', async () => {
    const settled = await Promise.allSettled([fetchUser(10), fetchUser(null), fetchUser(20)]);
    expect(settled[0].status).toBe('fulfilled');
    expect(settled[1].status).toBe('rejected');
    expect(settled[2].status).toBe('fulfilled');
  });

  it('processQueue processes every item in order', async () => {
    const results = await processQueue(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    results.forEach((r, i) => {
      expect(r.item).toBe(['a', 'b', 'c'][i]);
      expect(r.processed).toBe(true);
    });
  });

  it('processQueue handles an empty queue', async () => {
    expect(await processQueue([])).toEqual([]);
  });

  it('processQueue timestamps are monotonically non-decreasing', async () => {
    const results = await processQueue([1, 2, 3, 4]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].ts).toBeGreaterThanOrEqual(results[i - 1].ts);
    }
  });

  it('fetchWithTimeout resolves when operation completes in time', async () => {
    const fast = () => sleep(10).then(() => 'done');
    expect(await fetchWithTimeout(fast, 500)).toBe('done');
  });

  it('fetchWithTimeout rejects immediately if the operation itself rejects', async () => {
    const failing = () => Promise.reject(new Error('boom'));
    await expect(fetchWithTimeout(failing, 500)).rejects.toThrow('boom');
  });

  it('waitForEvent resolves when the target event fires', async () => {
    const emitter = new EventEmitter();
    const payload = { key: 'value' };
    setTimeout(() => emitter.emit('done', payload), 30);
    expect(await waitForEvent(emitter, 'done')).toEqual(payload);
  });

  it('waitForEvent rejects when the emitter fires an error', async () => {
    const emitter = new EventEmitter();
    emitter.on('error', () => {});
    setTimeout(() => emitter.emit('error', new Error('emitter failed')), 20);
    await expect(waitForEvent(emitter, 'done')).rejects.toThrow('emitter failed');
  });

  it('waitForEvent resolves on the first of multiple rapid emissions', async () => {
    const emitter = new EventEmitter();
    process.nextTick(() => {
      emitter.emit('ready', 1);
      emitter.emit('ready', 2);
    });
    expect(await waitForEvent(emitter, 'ready')).toBe(1);
  });

  it('withRetry returns immediately when the first attempt succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, 3, 5)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('withRetry throws after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(fn, 2, 5)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ASYNC FLAKY TESTS

describe('Async - flaky tests', () => {
  it('[FLAKY] fetchWithTimeout rejects when operation is too slow', async () => {
    const slow = () => sleep(300).then(() => 'late');
    await expect(fetchWithTimeout(slow, 50)).rejects.toThrow('Timed out after 50ms');
  });

  it('[FLAKY] withRetry succeeds on the third attempt after two failures', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('not yet');
      return 'success';
    });
    expect(await withRetry(fn, 3, 5)).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('[FLAKY] withRetry does not exceed the specified retry count', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('x'));
    try { await withRetry(fn, 1, 5); } catch (_) { /* expected */ }
    expect(fn).toHaveBeenCalledTimes(2); 
  });

  it('[FLAKY] fetchWithTimeout + retry: retries on timeout, succeeds when next call is fast', async () => {
    let calls = 0;
    const call = () => {
      calls++;
      if (calls === 1) return fetchWithTimeout(() => sleep(300).then(() => 'slow'), 50);
      return fetchWithTimeout(() => Promise.resolve('fast'), 500);
    };
    const result = await withRetry(call, 2, 5);
    expect(result).toBe('fast');
  });

  it('[FLAKY] fetchWithTimeout + retry: fails when every attempt times out', async () => {
    const alwaysSlow = () => fetchWithTimeout(() => sleep(500).then(() => 'late'), 20);
    await expect(withRetry(alwaysSlow, 2, 5)).rejects.toBeDefined();
  });

  it('[FLAKY] Promise.allSettled handles a mix of fast, slow, and failing async calls', async () => {
    let calls = 0;
    const flakyFetch = async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return fetchUser(99);
    };

    const results = await Promise.allSettled([
      fetchUser(1),
      flakyFetch(),                             // fails on first call
      fetchUser(null),                          // always rejects
      withRetry(flakyFetch, 2, 5),              // retries and succeeds
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected'); // no retry, fails
    expect(results[2].status).toBe('rejected'); // invalid id
    expect(results[3].status).toBe('fulfilled'); // retried to success
  });
});
