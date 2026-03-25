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

const app = express();

app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_request, response) => {
  response.json({
    service: 'cripto-ia-backend',
    version: '1.9.0',
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
app.use('/internal', internalRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: 'internal_server_error',
    message: error.message,
  });
});

module.exports = app;
