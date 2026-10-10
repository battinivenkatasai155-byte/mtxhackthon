jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  checkDatabase: jest.fn(),
  closeDatabase: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { pool } = require('../src/config/database');
const secret = process.env.JWT_SECRET;

describe('authentication and authorization', () => {
  test('registration validates input and stores only a bcrypt hash', async () => {
    const invalid = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Test Citizen',
      email: 'citizen@example.test',
      password: 'short'
    });
    expect(invalid.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();

    const client = {
      query: jest.fn(async (sql) => sql.includes('INSERT INTO users')
        ? { rows: [{ id: '459e7a43-730f-4983-9a17-79c88783f316', full_name: 'Test Citizen', email: 'citizen@example.test', role: 'citizen' }] }
        : { rows: [], rowCount: 1 }),
      release: jest.fn()
    };
    pool.connect.mockResolvedValueOnce(client);
    const response = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Test Citizen',
      email: 'CITIZEN@example.test',
      password: 'long-test-password'
    });
    expect(response.status).toBe(201);
    const insertedHash = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'))[1][2];
    expect(insertedHash).not.toBe('long-test-password');
    expect(await bcrypt.compare('long-test-password', insertedHash)).toBe(true);
    expect(response.body.user.role).toBe('citizen');
    expect(response.body.token).toBeTruthy();
  });

  test('login returns a token for valid credentials and a generic error otherwise', async () => {
    const hash = await bcrypt.hash('long-test-password', 4);
    pool.query.mockResolvedValueOnce({
      rows: [{ id: '459e7a43-730f-4983-9a17-79c88783f316', full_name: 'Test Citizen', email: 'citizen@example.test', password_hash: hash, role: 'citizen', is_active: true }]
    });
    const success = await request(app).post('/api/v1/auth/login').send({
      email: 'citizen@example.test',
      password: 'long-test-password'
    });
    expect(success.status).toBe(200);
    expect(jwt.verify(success.body.token, secret).sub).toBe('459e7a43-730f-4983-9a17-79c88783f316');

    pool.query.mockResolvedValueOnce({ rows: [] });
    const failure = await request(app).post('/api/v1/auth/login').send({
      email: 'missing@example.test',
      password: 'long-test-password'
    });
    expect(failure.status).toBe(401);
    expect(failure.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('rejects missing, invalid, and expired tokens', async () => {
    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);

    const invalid = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-token');
    expect(invalid.status).toBe(401);

    const expired = jwt.sign({ sub: '459e7a43-730f-4983-9a17-79c88783f316' }, secret, { expiresIn: '-1s' });
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(response.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('checks live role data before granting administrator access', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: '459e7a43-730f-4983-9a17-79c88783f316',
        full_name: 'Test Citizen',
        email: 'citizen@example.test',
        role: 'citizen',
        is_active: true,
        department_ids: []
      }]
    });
    const token = jwt.sign({ sub: '459e7a43-730f-4983-9a17-79c88783f316', role: 'administrator' }, secret);
    const response = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('database failures are not returned as successful authentication', async () => {
    const unavailable = new Error('database unavailable');
    unavailable.code = 'ECONNREFUSED';
    const client = {
      query: jest.fn().mockRejectedValueOnce(unavailable),
      release: jest.fn()
    };
    pool.connect.mockResolvedValueOnce(client);
    const response = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Test Citizen',
      email: 'citizen@example.test',
      password: 'long-test-password'
    });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ECONNREFUSED');
  });
});
