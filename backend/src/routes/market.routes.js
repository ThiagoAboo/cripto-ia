const express = require('express');
const env = require('../config/env');
const { getSymbols, getCandles, getTickers, parseBoolean } = require('../services/market.service');

const router = express.Router();

router.get('/symbols', async (request, response, next) => {
  try {
    const quoteAsset = String(request.query.quoteAsset || 'USDT').toUpperCase();
    const refresh = parseBoolean(request.query.refresh, false);
    const symbols = await getSymbols({ quoteAsset, refresh });

    response.json({
      quoteAsset,
      count: symbols.length,
      items: symbols,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/candles/:symbol', async (request, response, next) => {
  try {
    const symbol = String(request.params.symbol || '').toUpperCase();
    const interval = String(request.query.interval || '5m');
    const limit = Number(request.query.limit || env.market.defaultCandleLimit);
    const refresh = parseBoolean(request.query.refresh, false);

    if (!symbol) {
      response.status(400).json({ error: 'symbol_required' });
      return;
    }

    const payload = await getCandles({ symbol, interval, limit, refresh });
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/tickers', async (request, response, next) => {
  try {
    const symbols = String(request.query.symbols || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    if (!symbols.length) {
      response.status(400).json({ error: 'symbols_required' });
      return;
    }

    const refresh = parseBoolean(request.query.refresh, false);
    const tickers = await getTickers({ symbols, refresh });

    response.json({
      count: tickers.length,
      items: tickers,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
