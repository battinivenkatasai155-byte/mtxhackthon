jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  checkDatabase: jest.fn(),
  closeDatabase: jest.fn()
}));

const { pool } = require('../src/config/database');
const routingService = require('../src/services/routing.service');
const grievanceId = '810a59a4-e1db-4690-ae45-ec1d5fa0081c';
const primaryId = '11111111-1111-4111-8111-111111111111';
const secondaryId = '22222222-2222-4222-8222-222222222222';
const admin = { id: '459e7a43-730f-4983-9a17-79c88783f316', role: 'administrator' };

test('classification persists a marked rules fallback and review metadata', async () => {
  pool.query
    .mockResolvedValueOnce({
      rows: [{
        id: grievanceId,
        citizen_id: admin.id,
        subject: 'Water supply interruption',
        description: 'The drinking water supply has stopped for several days.',
        status: 'submitted'
      }]
    })
    .mockResolvedValueOnce({
      rows: [
        { id: primaryId, code: 'WATER', name: 'Water Supply' },
        { id: secondaryId, code: 'MUNICIPAL', name: 'Municipal Administration' }
      ]
    });
  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT id, citizen_id, status FROM grievances')) {
        return { rows: [{ id: grievanceId, citizen_id: admin.id, status: 'submitted' }] };
      }
      if (sql.includes('INSERT INTO grievance_classifications')) {
        return { rows: [{ id: '60000000-0000-4000-8000-000000000001', method: 'rules', confidence: 0.61 }] };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn()
  };
  pool.connect.mockResolvedValueOnce(client);

  const result = await routingService.classifyGrievance(grievanceId, admin, 'req-classify');
  expect(result.fallback).toBe(true);
  expect(result.method).toBe('rules');
  expect(client.query.mock.calls.some(([sql]) => sql.includes('requires_human_review'))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('grievance_status_history'))).toBe(true);
});

test('multi-department routing stores a reason per assignment and status audit', async () => {
  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT id, citizen_id, status FROM grievances')) {
        return { rows: [{ id: grievanceId, citizen_id: admin.id, status: 'classified' }] };
      }
      if (sql.includes('SELECT * FROM grievance_classifications')) {
        return {
          rows: [{
            id: '70000000-0000-4000-8000-000000000001',
            primary_department_id: primaryId,
            secondary_department_ids: [secondaryId],
            method: 'rules',
            confidence: 0.72
          }]
        };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn()
  };
  pool.connect.mockResolvedValueOnce(client);

  const result = await routingService.routeGrievance(grievanceId, admin, 'req-route');
  expect(result.assignments).toHaveLength(2);
  const assignments = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO grievance_department_assignments'));
  expect(assignments).toHaveLength(2);
  expect(assignments[0][1][3]).toContain('Primary department');
  expect(assignments[1][1][3]).toContain('Secondary department');
  expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO grievance_routes'))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('grievance_status_history'))).toBe(true);
});
