const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ ok: true, service: 'backend', timestamp: new Date().toISOString() });
  } catch (error) {
    response.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

module.exports = router;
