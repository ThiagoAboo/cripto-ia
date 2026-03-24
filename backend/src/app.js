const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const configRoutes = require('./routes/config.routes');
const statusRoutes = require('./routes/status.routes');
const internalRoutes = require('./routes/internal.routes');
const marketRoutes = require('./routes/market.routes');

const app = express();

app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_request, response) => {
  response.json({
    service: 'cripto-ia-backend',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/config', configRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/market', marketRoutes);
app.use('/internal', internalRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: 'internal_server_error',
    message: error.message,
  });
});

module.exports = app;
