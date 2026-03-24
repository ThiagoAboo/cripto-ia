const dotenv = require('dotenv');

dotenv.config();

function getEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = {
  port: Number(getEnv('PORT', 4000)),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  corsOrigin: getEnv('CORS_ORIGIN', '*'),
  db: {
    host: getEnv('DB_HOST', 'localhost'),
    port: Number(getEnv('DB_PORT', 5432)),
    database: getEnv('DB_NAME', 'criptoia'),
    user: getEnv('DB_USER', 'postgres'),
    password: getEnv('DB_PASSWORD', 'postgres'),
  },
  internalApiKey: getEnv('INTERNAL_API_KEY', 'troque-esta-chave'),
};
