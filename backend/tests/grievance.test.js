jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  checkDatabase: jest.fn(),
  closeDatabase: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const grievanceService = require('../src/services/grievance.service');
const { pool } = require('../src/config/database');

const citizenId = '459e7a43-730f-4983-9a17-79c88783f316';
const grievanceId = '810a59a4-e1db-4690-ae45-ec1d5fa0081c';
const token = jwt.sign({ sub: citizenId }, process.env.JWT_SECRET);

function mockCitizen() {
  pool.query.mockResolvedValueOnce({
    rows: [{
      id: citizenId,
      full_name: 'Test Citizen',
      email: 'citizen@example.test',
      role: 'citizen',
      is_active: true,
      department_ids: []
    }]
  });
}

test('submits a text-only grievance and records transaction history', async () => {
  mockCitizen();
  pool.query.mockResolvedValueOnce({
    rows: [{ id: '11111111-1111-4111-8111-111111111111', code: 'WATER', name: 'Water Supply' }]
  });
  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO grievances')) {
        return {
          rows: [{
            id: grievanceId,
            tracking_id: 'CPG-2026-0123456789ABCDEF0123456789ABCDEF0123',
            subject: 'Water is not available',
            description: 'There has been no drinking water for several days.',
            status: 'submitted',
            priority: 'medium'
          }]
        };
      }
      if (sql.includes('INSERT INTO grievance_classifications')) {
        return { rows: [{ id: '71000000-0000-4000-8000-000000000001', method: 'rules', confidence: 0.61 }] };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn()
  };
  pool.connect.mockResolvedValueOnce(client);

  const response = await request(app)
    .post('/api/v1/grievances')
    .set('Authorization', `Bearer ${token}`)
    .send({
      subject: 'Water is not available',
      description: 'There has been no drinking water for several days.'
    });
  expect(response.status).toBe(201);
  expect(response.body.grievance.status).toBe('classified');
  expect(response.body.grievance.classification.fallback).toBe(true);
  expect(response.body.grievance.routing).toBeNull();
  expect(response.body.grievance.attachments).toEqual([]);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('grievance_status_history'))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('audit_logs'))).toBe(true);
  expect(client.release).toHaveBeenCalled();
});

test('requires authentication and validates grievance content', async () => {
  const unauthorized = await request(app).post('/api/v1/grievances').send({
    subject: 'abc',
    description: 'short'
  });
  expect(unauthorized.status).toBe(401);

  mockCitizen();
  const invalid = await request(app)
    .post('/api/v1/grievances')
    .set('Authorization', `Bearer ${token}`)
    .send({ subject: 'abc', description: 'short' });
  expect(invalid.status).toBe(400);
});

test('rejects an attachment whose bytes do not match the declared PDF type', async () => {
  mockCitizen();
  const response = await request(app)
    .post('/api/v1/grievances')
    .set('Authorization', `Bearer ${token}`)
    .field('subject', 'Water supply disruption')
    .field('description', 'There has been no drinking water for several days.')
    .attach('attachments', Buffer.from('not a PDF'), {
      filename: 'evidence.pdf',
      contentType: 'application/pdf'
    });
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('INVALID_ATTACHMENT_CONTENT');
  expect(pool.connect).not.toHaveBeenCalled();
});

test('status history is authorization-scoped and returns actual stored events', async () => {
  pool.query
    .mockResolvedValueOnce({ rows: [{ id: grievanceId }] })
    .mockResolvedValueOnce({ rows: [{ previous_status: null, new_status: 'submitted', explanation: 'Submitted', created_at: new Date() }] });
  const history = await grievanceService.getHistory(grievanceId, {
    id: citizenId,
    role: 'citizen',
    departmentIds: []
  });
  expect(history).toHaveLength(1);
  expect(pool.query.mock.calls[0][0]).toContain('citizen_id = $2');
  expect(history[0].new_status).toBe('submitted');
});
