const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const env = require('./config/env');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const grievanceRoutes = require('./routes/grievance.routes');
const departmentRoutes = require('./routes/department.routes');
const clusterRoutes = require('./routes/cluster.routes');
const adminRoutes = require('./routes/admin.routes');
const openapi = require('./docs/openapi');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(requestId);
app.use(requestLogger);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error('Origin is not allowed by CORS.');
    error.status = 403;
    error.code = 'CORS_ORIGIN_DENIED';
    return callback(error);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/grievances', grievanceRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/clusters', clusterRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
