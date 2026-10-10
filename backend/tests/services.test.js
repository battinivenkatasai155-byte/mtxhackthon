jest.mock('../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  checkDatabase: jest.fn(),
  closeDatabase: jest.fn()
}));

const { pool } = require('../src/config/database');
const { classify, ruleClassify } = require('../src/services/classification.service');
const { calculatePriority, factorsFromGrievance } = require('../src/services/priority.service');
const { similarity, analyze } = require('../src/services/clustering.service');
const { transitionStatus } = require('../src/services/status.service');

const departments = [
  { id: '11111111-1111-4111-8111-111111111111', code: 'WATER', name: 'Water Supply' },
  { id: '22222222-2222-4222-8222-222222222222', code: 'MUNICIPAL', name: 'Municipal Administration' }
];

test('rules classifier records multi-department evidence and human review', () => {
  const result = ruleClassify(
    'Contaminated drinking water from a damaged municipal pipe is leaking.',
    departments
  );
  expect(result.method).toBe('rules');
  expect(result.primaryDepartmentId).toBe(departments[0].id);
  expect(result.secondaryDepartmentIds).toContain(departments[1].id);
  expect(result.explanation).toContain('damaged municipal pipe');
  expect(result.requiresHumanReview).toBe(true);

  const uncertain = ruleClassify('A request for an unrelated service.', departments);
  expect(uncertain.primaryDepartmentId).toBeNull();
  expect(uncertain.requiresHumanReview).toBe(true);
});

test('configured provider output is schema-checked and provider failures are explicitly rules fallback', async () => {
  const grievance = {
    subject: 'Water supply is interrupted',
    description: 'Several streets have had no drinking water for days.'
  };
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      primaryDepartment: 'WATER',
      secondaryDepartments: ['MUNICIPAL'],
      category: 'water_supply',
      urgency: 'medium',
      confidence: 0.88,
      explanation: 'Water supply disruption is described.',
      suggestedKeywords: ['water', 'supply'],
      requiresHumanReview: false
    })
  });
  const provided = await classify(grievance, departments, {
    url: 'https://classifier.example.test/classify',
    apiKey: 'unit-test-key'
  });
  expect(provided.method).toBe('provider');
  expect(provided.secondaryDepartmentIds).toEqual([departments[1].id]);
  expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer unit-test-key');

  fetchMock.mockRejectedValueOnce(new Error('simulated provider outage'));
  const fallback = await classify(grievance, departments, {
    url: 'https://classifier.example.test/classify',
    apiKey: 'unit-test-key'
  });
  expect(fallback.method).toBe('rules');
  expect(fallback.explanation).toContain('provider failed');
  fetchMock.mockRestore();
});

test('priority is transparent and potentially dangerous incidents receive human review signals', () => {
  const critical = calculatePriority({
    severity: 'critical',
    publicSafety: true,
    affectedPeople: 1000,
    repeatComplaints: 5,
    hoursWaiting: 48,
    ongoingIncident: true
  });
  expect(critical.priority).toBe('critical');
  expect(critical.score).toBeGreaterThanOrEqual(80);

  const assessed = factorsFromGrievance({
    subject: 'Dangerous electrical wire',
    description: 'A live wire is still exposed on a public path.'
  }, 0, 0);
  expect(['high', 'critical']).toContain(assessed.priority);
  expect(assessed.factors.publicSafety).toBeGreaterThan(0);
});

test('cluster similarity uses explainable text and metadata features', () => {
  const first = {
    subject: 'Damaged water pipeline near school',
    description: 'A broken drinking water pipe is leaking near the school in North District.',
    citizen_category: 'water_supply',
    district: 'North District',
    created_at: new Date('2026-06-01T00:00:00Z')
  };
  const second = {
    subject: 'Leaking drinking water pipe',
    description: 'The damaged pipeline is leaking beside the school in North District.',
    citizen_category: 'water_supply',
    district: 'North District',
    created_at: new Date('2026-06-03T00:00:00Z')
  };
  const match = similarity(first, second);
  expect(match.score).toBeGreaterThan(0.42);
  expect(match.evidence.sameCategory).toBe(true);
  expect(match.evidence.sameDistrict).toBe(true);
});

test('cluster analysis creates only a suspected cluster and stores evidence', async () => {
  const rows = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      tracking_id: 'CPG-1',
      subject: 'Damaged water pipeline near school',
      description: 'A broken drinking water pipe is leaking near the school in North District.',
      citizen_category: 'water_supply',
      district: 'North District',
      created_at: new Date('2026-06-01T00:00:00Z')
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      tracking_id: 'CPG-2',
      subject: 'Leaking drinking water pipe',
      description: 'The damaged pipeline is leaking beside the school in North District.',
      citizen_category: 'water_supply',
      district: 'North District',
      created_at: new Date('2026-06-03T00:00:00Z')
    }
  ];
  pool.query.mockResolvedValueOnce({ rows });
  const client = {
    query: jest.fn(async (sql) => sql.includes('INSERT INTO root_cause_clusters')
      ? { rows: [{ id: '20000000-0000-4000-8000-000000000001', state: 'suspected' }] }
      : { rows: [], rowCount: 1 }),
    release: jest.fn()
  };
  pool.connect.mockResolvedValueOnce(client);
  const cluster = await analyze([rows[0].id, rows[1].id], { id: rows[0].id }, 'request-1');
  expect(cluster.state).toBe('suspected');
  expect(cluster.memberCount).toBe(2);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('cluster_members'))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('audit_logs'))).toBe(true);
});

test('valid status transitions are recorded and invalid transitions are rejected', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
  await transitionStatus(client, {
    id: '30000000-0000-4000-8000-000000000001',
    citizen_id: '40000000-0000-4000-8000-000000000001',
    status: 'submitted'
  }, 'under_review', { id: '50000000-0000-4000-8000-000000000001', role: 'administrator' }, 'Review started', 'req-1');
  expect(client.query.mock.calls.some(([sql]) => sql.includes('grievance_status_history'))).toBe(true);

  await expect(transitionStatus(client, {
    id: '30000000-0000-4000-8000-000000000001',
    status: 'submitted'
  }, 'resolved', { id: '50000000-0000-4000-8000-000000000001', role: 'administrator' }, 'Invalid', 'req-1'))
    .rejects.toMatchObject({ status: 409, code: 'INVALID_STATUS_TRANSITION' });
});
