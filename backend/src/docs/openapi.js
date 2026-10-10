const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const bearer = [{ bearerAuth: [] }];
const jsonResponse = {
  '200': { description: 'Successful response' },
  '400': { description: 'Invalid request' },
  '401': { description: 'Authentication required or invalid' },
  '403': { description: 'Not authorized' },
  '404': { description: 'Resource not found' },
  '500': { description: 'Unexpected server error' }
};

const specification = {
  openapi: '3.0.3',
  info: {
    title: 'CPGRAMS Grievance Routing API',
    version: '1.0.0',
    description: 'Versioned API for grievance intake, classification, routing, review, and tracking.'
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              requestId: { type: 'string' }
            }
          }
        }
      },
      GrievanceInput: {
        type: 'object',
        required: ['subject', 'description'],
        properties: {
          subject: { type: 'string', minLength: 5, maxLength: 200 },
          description: { type: 'string', minLength: 10, maxLength: 10000 },
          category: { type: 'string' },
          location: { type: 'object' },
          affectedPeople: { type: 'integer', minimum: 1, maximum: 1000000 },
          ongoingIncident: { type: 'boolean' }
        }
      }
    }
  },
  paths: {
    '/health': { get: { summary: 'Process liveness', responses: { '200': { description: 'Process is running' } } } },
    '/ready': { get: { summary: 'Dependency readiness', responses: { '200': { description: 'Database is ready' }, '503': { description: 'Database is unavailable' } } } },
    '/auth/register': {
      post: {
        summary: 'Register a citizen account',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fullName', 'email', 'password'] } } } },
        responses: { ...jsonResponse, '201': { description: 'Citizen account created' }, '409': { description: 'Email already registered' } }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Log in',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 12, maxLength: 128 }
                }
              }
            }
          }
        },
        responses: jsonResponse
      }
    },
    '/auth/me': { get: { summary: 'Get authenticated identity', security: bearer, responses: jsonResponse } },
    '/grievances': {
      get: { summary: 'List authorized grievances', security: bearer, parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } }], responses: jsonResponse },
      post: { summary: 'Submit a grievance (JSON or multipart evidence)', security: bearer, requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GrievanceInput' } }, 'multipart/form-data': { schema: { $ref: '#/components/schemas/GrievanceInput' } } } }, responses: { ...jsonResponse, '201': { description: 'Grievance submitted' } } }
    },
    '/grievances/track/{trackingId}': { get: { summary: 'Public minimal-status tracking', parameters: [{ name: 'trackingId', in: 'path', required: true, schema: { type: 'string' } }], responses: jsonResponse } },
    '/grievances/{id}': {
      get: { summary: 'Get an authorized grievance', security: bearer, parameters: [id], responses: jsonResponse },
      patch: { summary: 'Edit a citizen grievance while submitted', security: bearer, parameters: [id], responses: jsonResponse }
    },
    '/grievances/{id}/history': { get: { summary: 'Get authorized status history', security: bearer, parameters: [id], responses: jsonResponse } },
    '/grievances/{id}/status': { patch: { summary: 'Transition status if the role and current state permit it', security: bearer, parameters: [id], responses: jsonResponse } },
    '/grievances/{id}/attachments/{attachmentId}': { get: { summary: 'Download an authorized private attachment', security: bearer, parameters: [id, { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: jsonResponse } },
    '/grievances/{id}/classify': { post: { summary: 'Classify a grievance (administrator)', security: bearer, parameters: [id], responses: jsonResponse } },
    '/grievances/{id}/route': { post: { summary: 'Route a classified grievance (administrator); requires a review reason if classification is uncertain or urgent', security: bearer, parameters: [id], responses: jsonResponse } },
    '/grievances/{id}/routing': { get: { summary: 'View routing history', security: bearer, parameters: [id], responses: jsonResponse } },
    '/grievances/{id}/reassign': { post: { summary: 'Manually reassign (administrator)', security: bearer, parameters: [id], responses: jsonResponse } },
    '/departments': { get: { summary: 'List active departments', responses: jsonResponse } },
    '/departments/{id}': { get: { summary: 'Get a department', parameters: [id], responses: jsonResponse } },
    '/departments/{id}/grievances': { get: { summary: 'List department assignments', security: bearer, parameters: [id], responses: jsonResponse } },
    '/departments/{id}/statistics': { get: { summary: 'Department statistics', security: bearer, parameters: [id], responses: jsonResponse } },
    '/clusters': { get: { summary: 'List suspected and reviewed clusters (administrator)', security: bearer, responses: jsonResponse } },
    '/clusters/analyze': { post: { summary: 'Analyze candidate grievance similarities', security: bearer, responses: jsonResponse } },
    '/clusters/{id}': { get: { summary: 'Get a cluster (administrator)', security: bearer, parameters: [id], responses: jsonResponse } },
    '/clusters/{id}/grievances': {
      get: { summary: 'List cluster members', security: bearer, parameters: [id], responses: jsonResponse },
      post: { summary: 'Add a candidate after similarity validation', security: bearer, parameters: [id], responses: jsonResponse }
    },
    '/clusters/{id}/grievances/{grievanceId}': { delete: { summary: 'Remove a member from a cluster', security: bearer, parameters: [id, { name: 'grievanceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: jsonResponse } },
    '/clusters/{id}/review': { post: { summary: 'Confirm or reject a suspected cluster', security: bearer, parameters: [id], responses: jsonResponse } },
    '/admin/dashboard': { get: { summary: 'Dashboard summary', security: bearer, responses: jsonResponse } },
    '/admin/statistics': { get: { summary: 'Database-backed system statistics', security: bearer, responses: jsonResponse } },
    '/admin/audit-logs': { get: { summary: 'Paginated audit logs', security: bearer, responses: jsonResponse } },
    '/admin/users/officers': { post: { summary: 'Provision a department officer with a hashed password', security: bearer, responses: { ...jsonResponse, '201': { description: 'Officer created' } } } },
    '/admin/departments': { post: { summary: 'Create a department', security: bearer, responses: { ...jsonResponse, '201': { description: 'Department created' } } } },
    '/admin/departments/{id}': { patch: { summary: 'Update or deactivate a department', security: bearer, parameters: [id], responses: jsonResponse } },
    '/admin/grievances/{id}/priority': { patch: { summary: 'Set priority with reason', security: bearer, parameters: [id], responses: jsonResponse } },
    '/admin/grievances/{id}/status': { patch: { summary: 'Transition grievance status', security: bearer, parameters: [id], responses: jsonResponse } }
  }
};

module.exports = specification;
