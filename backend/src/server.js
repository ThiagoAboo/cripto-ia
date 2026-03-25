const app = require('./app');
const env = require('./config/env');
const pool = require('./db/pool');
const { initializeDatabase } = require('./db/schema');
const { startSchedulers, stopSchedulers } = require('./services/scheduler.service');

async function bootstrap() {
  await initializeDatabase();

  const server = app.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port}`);
  });

  startSchedulers();

  const shutdown = async () => {
    console.log('Shutting down backend...');
    stopSchedulers();
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
