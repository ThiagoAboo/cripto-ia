const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool(env.db);

pool.on('error', (error) => {
  console.error('PostgreSQL pool error:', error);
});

module.exports = pool;
