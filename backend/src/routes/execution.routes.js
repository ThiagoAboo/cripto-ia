const express = require('express');
const { getExecutionStatus } = require('../services/executionAdapter.service');

const router = express.Router();

router.get('/status', async (_request, response, next) => {
  try {
    const status = await getExecutionStatus();
    response.json(status);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
