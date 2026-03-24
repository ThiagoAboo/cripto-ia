const express = require('express');
const { listRecentDecisions } = require('../services/portfolio.service');

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 50);
    const decisions = await listRecentDecisions({ limit });
    response.json({
      count: decisions.length,
      items: decisions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
