const express = require('express');
const { getPaperSummary, listPaperOrders } = require('../services/portfolio.service');

const router = express.Router();

router.get('/', async (_request, response, next) => {
  try {
    const summary = await getPaperSummary();
    response.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/positions', async (_request, response, next) => {
  try {
    const summary = await getPaperSummary();
    response.json({
      count: summary.positions.length,
      items: summary.positions,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (request, response, next) => {
  try {
    const limit = Number(request.query.limit || 50);
    const orders = await listPaperOrders({ limit });
    response.json({
      count: orders.length,
      items: orders,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
