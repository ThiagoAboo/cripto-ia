const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const configRoutes = require('./routes/config.routes');
const statusRoutes = require('./routes/status.routes');
const internalRoutes = require('./routes/internal.routes');
const marketRoutes = require('./routes/market.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const decisionsRoutes = require('./routes/decisions.routes');
const socialRoutes = require('./routes/social.routes');
const executionRoutes = require('./routes/execution.routes');
const controlRoutes = require('./routes/control.routes');
const backtestsRoutes = require('./routes/backtests.routes');
const optimizerRoutes = require('./routes/optimizer.routes');
const promotionsRoutes = require('./routes/promotions.routes');
const alertsRoutes = require('./routes/alerts.routes');
const readinessRoutes = require('./routes/readiness.routes');
const jobsRoutes = require('./routes/jobs.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const policyRoutes = require('./routes/policy.routes');
const observabilityRoutes = require('./routes/observability.routes');
const runbooksRoutes = require('./routes/runbooks.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const trainingRoutes = require('./routes/training.routes');

const app = express();

app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_request, response) => {
  response.json({
    service: 'cripto-ia-backend',
    version: '1.18.0',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/config', configRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/decisions', decisionsRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/execution', executionRoutes);
app.use('/api/control', controlRoutes);
app.use('/api/backtests', backtestsRoutes);
app.use('/api/optimizer', optimizerRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/readiness', readinessRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/observability', observabilityRoutes);
app.use('/api/runbooks', runbooksRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/training', trainingRoutes);
app.use('/internal', internalRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: 'internal_server_error',
    message: error.message,
  });
});

module.exports = app;
