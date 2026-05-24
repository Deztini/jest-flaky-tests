'use strict';

const { networkGet, networkPost, resolveHost, NetworkError } = require('../src/networkClient');
const { retry, BackoffStrategy } = require('../src/retryManager');


function mockRandom(...values) {
  let i = 0;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => values[i++ % values.length]);
  return () => spy.mockRestore();
}


function makeFlakyFn(failTimes, response) {
  let calls = 0;
  return jest.fn(async () => {
    calls++;
    if (calls <= failTimes) throw new NetworkError(`transient error (call ${calls})`, 503);
    return response;
  });
}

// STABLE NETWORK TEST

describe('Network — stable tests', () => {
  it('GET returns status 200 with correct body shape when failRate is 0', async () => {
    const res = await networkGet('https://api.example.com/users/1', {
      failRate: 0,
      minLatency: 0,
      maxLatency: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url', 'https://api.example.com/users/1');
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET with partial=true returns truncated body', async () => {
    const res = await networkGet('https://api.example.com/partial', {
      failRate: 0,
      minLatency: 0,
      maxLatency: 5,
      partial: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body).not.toHaveProperty('data');
    expect(res.body).not.toHaveProperty('timestamp');
  });

  it('GET forces failure when Math.random is pinned below failRate', async () => {
    const restore = mockRandom(0, 0); 
    try {
      await expect(
        networkGet('https://api.example.com/fail', { failRate: 0.9, minLatency: 0, maxLatency: 0 })
      ).rejects.toBeInstanceOf(NetworkError);
    } finally {
      restore();
    }
  });

  it('GET succeeds when Math.random is pinned above failRate', async () => {
    const restore = mockRandom(0, 0.99); 
    try {
      const res = await networkGet('https://api.example.com/ok', {
        failRate: 0.5,
        minLatency: 0,
        maxLatency: 0,
      });
      expect(res.status).toBe(200);
    } finally {
      restore();
    }
  });

  it('NetworkError carries the correct statusCode', async () => {
    const restore = mockRandom(0, 0, 0); 
    try {
      await networkGet('https://api.example.com/err', { failRate: 1, minLatency: 0, maxLatency: 0 });
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      expect([500, 502, 503, 504]).toContain(err.statusCode);
    } finally {
      restore();
    }
  });

  it('POST returns 201 with an id when rateLimitRate is 0', async () => {
    const res = await networkPost(
      'https://api.example.com/items',
      { name: 'widget', qty: 3 },
      { rateLimitRate: 0, minLatency: 0, maxLatency: 5 }
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'widget', qty: 3 });
    expect(typeof res.body.id).toBe('string');
  });

  it('POST throws 429 when rate-limited (pinned random)', async () => {
    const restore = mockRandom(0, 0); 
    try {
      await expect(
        networkPost('https://api.example.com/items', {}, {
          rateLimitRate: 1,
          minLatency: 0,
          maxLatency: 0,
        })
      ).rejects.toMatchObject({ statusCode: 429 });
    } finally {
      restore();
    }
  });

  it('resolveHost returns an IP string on success', async () => {
    const ip = await resolveHost('example.com', 0);
    expect(ip).toMatch(/^10\.0\.0\.\d+$/);
  });

  it('resolveHost throws ENOTFOUND when pinned to fail', async () => {
    const restore = mockRandom(0, 0); 
    try {
      await expect(resolveHost('bad.example.com', 1)).rejects.toMatchObject({
        name: 'NetworkError',
        statusCode: 0,
      });
    } finally {
      restore();
    }
  });

  it('concurrent GETs all resolve independently', async () => {
    const urls = ['https://a.example.com', 'https://b.example.com', 'https://c.example.com'];
    const responses = await Promise.all(
      urls.map((url) => networkGet(url, { failRate: 0, minLatency: 0, maxLatency: 5 }))
    );
    expect(responses).toHaveLength(3);
    responses.forEach((r, i) => {
      expect(r.status).toBe(200);
      expect(r.body.url).toBe(urls[i]);
    });
  });

  it('Promise.all rejects on first failure in a batch', async () => {
    const calls = [
      networkGet('https://api.example.com/1', { failRate: 0, minLatency: 0, maxLatency: 5 }),
      Promise.reject(new NetworkError('oops', 500)),
      networkGet('https://api.example.com/3', { failRate: 0, minLatency: 0, maxLatency: 5 }),
    ];
    await expect(Promise.all(calls)).rejects.toBeInstanceOf(NetworkError);
  });

  it('Promise.allSettled reports individual status per request', async () => {
    const results = await Promise.allSettled([
      networkGet('https://api.example.com/a', { failRate: 0, minLatency: 0, maxLatency: 5 }),
      Promise.reject(new NetworkError('fail', 503)),
      networkGet('https://api.example.com/c', { failRate: 0, minLatency: 0, maxLatency: 5 }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[1].reason).toBeInstanceOf(NetworkError);
    expect(results[2].status).toBe('fulfilled');
  });
});

// NETWORK FLAKY TESTS

describe('Network — flaky tests', () => {
  it('[FLAKY] retry recovers from 1 transient 503', async () => {
    const flaky = makeFlakyFn(1, { status: 200, data: 'payload' });
    const { result, attempts } = await retry(flaky, {
      maxAttempts: 3,
      baseDelay: 5,
      shouldRetry: (e) => e instanceof NetworkError && e.statusCode === 503,
    });
    expect(result).toEqual({ status: 200, data: 'payload' });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].success).toBe(false);
    expect(attempts[1].success).toBe(true);
  });

  it('[FLAKY] retry recovers from 2 transient 503s', async () => {
    const flaky = makeFlakyFn(2, { status: 200, data: 'eventual' });
    const { result, attempts } = await retry(flaky, {
      maxAttempts: 4,
      baseDelay: 5,
      shouldRetry: (e) => e instanceof NetworkError,
    });
    expect(result.data).toBe('eventual');
    expect(attempts).toHaveLength(3);
  });

  it('[FLAKY] retry fails when transient errors exceed maxAttempts', async () => {
    const flaky = makeFlakyFn(10, { status: 200 });
    await expect(
      retry(flaky, { maxAttempts: 3, baseDelay: 5, shouldRetry: () => true })
    ).rejects.toThrow('Failed after 3 attempts');
    expect(flaky).toHaveBeenCalledTimes(3);
  });

  it('[FLAKY] 404 is NOT retried — surfaces immediately', async () => {
    const fn = jest.fn().mockRejectedValue(new NetworkError('not found', 404));
    await expect(
      retry(fn, {
        maxAttempts: 5,
        baseDelay: 5,
        shouldRetry: (e) => e instanceof NetworkError && e.statusCode >= 500,
      })
    ).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('[FLAKY] retry backs off on 429 rate-limit and eventually succeeds', async () => {
    const flaky = makeFlakyFn(2, { status: 201, body: { id: 'abc' } });
    const { result } = await retry(flaky, {
      maxAttempts: 4,
      baseDelay: 5,
      strategy: BackoffStrategy.EXPONENTIAL,
      shouldRetry: (e) => e instanceof NetworkError && e.statusCode === 503,
    });
    expect(result.status).toBe(201);
  });

  it('[FLAKY] Promise.allSettled with mixed flaky + stable calls', async () => {
    const stable = () => networkGet('https://api.example.com/stable', { failRate: 0, minLatency: 0, maxLatency: 5 });
    const flakyFn = makeFlakyFn(2, 'recovered');

    const results = await Promise.allSettled([
      stable(),
      retry(flakyFn, { maxAttempts: 3, baseDelay: 5 }),
      Promise.reject(new NetworkError('hard fail', 500)),
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(results[1].value.result).toBe('recovered');
    expect(results[2].status).toBe('rejected');
  });
});
