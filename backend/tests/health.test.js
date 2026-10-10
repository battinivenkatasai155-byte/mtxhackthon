jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  checkDatabase: jest.fn(),
  closeDatabase: jest.fn()
}));

const request = require('supertest');
const app = require('../src/app');
const { checkDatabase } = require('../src/config/database');

describe('health endpoints', () => {
  test('health reports liveness and echoes a safe request ID', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-1');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['x-request-id']).toBe('test-request-1');
  });

  test('readiness succeeds only when the database check succeeds', async () => {
    checkDatabase.mockResolvedValueOnce();
    const ready = await request(app).get('/api/v1/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.dependencies.database).toBe('ok');

    checkDatabase.mockRejectedValueOnce(new Error('connection refused'));
    const notReady = await request(app).get('/api/v1/ready');
    expect(notReady.status).toBe(503);
    expect(notReady.body.status).toBe('not_ready');
  });

  test('unknown routes return a structured 404', async () => {
    const response = await request(app).get('/api/v1/no-such-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });

  test('CORS rejects origins outside the configured allowlist', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.invalid');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CORS_ORIGIN_DENIED');
  });
});
