const pool = require('../db/pool');
const env = require('../config/env');
const {
  fetchExchangeInfo,
  fetchKlines,
  fetch24hrTickers,
} = require('./binance.service');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function serializeKline(raw) {
  return {
    openTime: Number(raw[0]),
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
    closeTime: Number(raw[6]),
    quoteVolume: Number(raw[7]),
    trades: Number(raw[8]),
    takerBuyBaseVolume: Number(raw[9]),
    takerBuyQuoteVolume: Number(raw[10]),
  };
}

async function syncSymbols({ quoteAsset = 'USDT' } = {}) {
  const symbols = await fetchExchangeInfo({ quoteAsset });

  for (const symbol of symbols) {
    await pool.query(
      `
        INSERT INTO market_symbols (symbol, base_asset, quote_asset, status, raw, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
        ON CONFLICT (symbol)
        DO UPDATE SET
          base_asset = EXCLUDED.base_asset,
          quote_asset = EXCLUDED.quote_asset,
          status = EXCLUDED.status,
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `,
      [
        symbol.symbol,
        symbol.baseAsset,
        symbol.quoteAsset,
        symbol.status,
        JSON.stringify(symbol),
      ],
    );
  }

  return symbols.map((item) => ({
    symbol: item.symbol,
    baseAsset: item.baseAsset,
    quoteAsset: item.quoteAsset,
    status: item.status,
  }));
}

async function getSymbols({ quoteAsset = 'USDT', refresh = false } = {}) {
  if (refresh) {
    return syncSymbols({ quoteAsset });
  }

  const result = await pool.query(
    `
      SELECT symbol, base_asset AS "baseAsset", quote_asset AS "quoteAsset", status, updated_at AS "updatedAt"
      FROM market_symbols
      WHERE quote_asset = $1
      ORDER BY symbol ASC
    `,
    [quoteAsset],
  );

  if (!result.rows.length) {
    return syncSymbols({ quoteAsset });
  }

  return result.rows;
}

async function upsertCandles({ symbol, interval, rawCandles }) {
  if (!rawCandles.length) return;

  const values = [];
  const params = [];
  let parameterIndex = 1;

  for (const raw of rawCandles) {
    const candle = serializeKline(raw);
    values.push(
      `($${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++})`,
    );

    params.push(
      'binance_spot',
      symbol,
      interval,
      candle.openTime,
      candle.closeTime,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
      candle.quoteVolume,
      candle.trades,
      candle.takerBuyBaseVolume,
      candle.takerBuyQuoteVolume,
      JSON.stringify(raw),
    );
  }

  await pool.query(
    `
      INSERT INTO market_candles (
        source,
        symbol,
        interval,
        open_time,
        close_time,
        open,
        high,
        low,
        close,
        volume,
        quote_volume,
        trades,
        taker_buy_base_volume,
        taker_buy_quote_volume,
        raw
      )
      VALUES ${values.join(', ')}
      ON CONFLICT (source, symbol, interval, open_time)
      DO UPDATE SET
        close_time = EXCLUDED.close_time,
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        quote_volume = EXCLUDED.quote_volume,
        trades = EXCLUDED.trades,
        taker_buy_base_volume = EXCLUDED.taker_buy_base_volume,
        taker_buy_quote_volume = EXCLUDED.taker_buy_quote_volume,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `,
    params,
  );
}

async function syncCandles({ symbol, interval = '5m', limit = env.market.defaultCandleLimit } = {}) {
  const rawCandles = await fetchKlines({ symbol, interval, limit });
  await upsertCandles({ symbol, interval, rawCandles });
}

async function getCandles({ symbol, interval = '5m', limit = env.market.defaultCandleLimit, refresh = false } = {}) {
  const requestedLimit = Math.min(Math.max(Number(limit) || env.market.defaultCandleLimit, 20), 1000);

  const freshnessResult = await pool.query(
    `
      SELECT COUNT(*)::int AS count, MAX(updated_at) AS last_updated_at
      FROM market_candles
      WHERE source = 'binance_spot' AND symbol = $1 AND interval = $2
    `,
    [symbol, interval],
  );

  const freshness = freshnessResult.rows[0];
  const count = Number(freshness?.count || 0);
  const lastUpdatedAt = freshness?.last_updated_at ? new Date(freshness.last_updated_at) : null;
  const staleMs = env.market.cacheTtlSec * 1000;
  const isStale = !lastUpdatedAt || (Date.now() - lastUpdatedAt.getTime()) > staleMs;

  if (refresh || count < requestedLimit || isStale) {
    await syncCandles({ symbol, interval, limit: requestedLimit });
  }

  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          source,
          symbol,
          interval,
          open_time AS "openTime",
          close_time AS "closeTime",
          open,
          high,
          low,
          close,
          volume,
          quote_volume AS "quoteVolume",
          trades,
          taker_buy_base_volume AS "takerBuyBaseVolume",
          taker_buy_quote_volume AS "takerBuyQuoteVolume",
          updated_at AS "updatedAt"
        FROM market_candles
        WHERE source = 'binance_spot' AND symbol = $1 AND interval = $2
        ORDER BY open_time DESC
        LIMIT $3
      ) candles
      ORDER BY "openTime" ASC
    `,
    [symbol, interval, requestedLimit],
  );

  return {
    source: 'binance_spot',
    symbol,
    interval,
    candles: result.rows.map((row) => ({
      ...row,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      quoteVolume: Number(row.quoteVolume),
      trades: Number(row.trades),
      takerBuyBaseVolume: Number(row.takerBuyBaseVolume),
      takerBuyQuoteVolume: Number(row.takerBuyQuoteVolume),
    })),
  };
}

async function syncTickers({ symbols = [] } = {}) {
  const rawTickers = await fetch24hrTickers({ symbols });

  for (const ticker of rawTickers) {
    await pool.query(
      `
        INSERT INTO market_tickers (
          source,
          symbol,
          price,
          price_change_percent,
          volume,
          quote_volume,
          trade_count,
          raw,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
        ON CONFLICT (symbol)
        DO UPDATE SET
          source = EXCLUDED.source,
          price = EXCLUDED.price,
          price_change_percent = EXCLUDED.price_change_percent,
          volume = EXCLUDED.volume,
          quote_volume = EXCLUDED.quote_volume,
          trade_count = EXCLUDED.trade_count,
          raw = EXCLUDED.raw,
          updated_at = NOW()
      `,
      [
        'binance_spot',
        ticker.symbol,
        Number(ticker.lastPrice || ticker.price || 0),
        Number(ticker.priceChangePercent || 0),
        Number(ticker.volume || 0),
        Number(ticker.quoteVolume || 0),
        Number(ticker.count || 0),
        JSON.stringify(ticker),
      ],
    );
  }
}

async function getTickers({ symbols = [], refresh = false } = {}) {
  const cleanSymbols = [...new Set(symbols.map((item) => String(item).toUpperCase()).filter(Boolean))];

  if (!cleanSymbols.length) {
    return [];
  }

  if (refresh) {
    await syncTickers({ symbols: cleanSymbols });
  } else {
    const freshnessResult = await pool.query(
      `
        SELECT MAX(updated_at) AS last_updated_at
        FROM market_tickers
        WHERE symbol = ANY($1::text[])
      `,
      [cleanSymbols],
    );

    const lastUpdatedAt = freshnessResult.rows[0]?.last_updated_at
      ? new Date(freshnessResult.rows[0].last_updated_at)
      : null;

    const isStale = !lastUpdatedAt || (Date.now() - lastUpdatedAt.getTime()) > env.market.cacheTtlSec * 1000;

    if (isStale) {
      await syncTickers({ symbols: cleanSymbols });
    }
  }

  const result = await pool.query(
    `
      SELECT
        source,
        symbol,
        price,
        price_change_percent AS "priceChangePercent",
        volume,
        quote_volume AS "quoteVolume",
        trade_count AS "tradeCount",
        updated_at AS "updatedAt"
      FROM market_tickers
      WHERE symbol = ANY($1::text[])
      ORDER BY symbol ASC
    `,
    [cleanSymbols],
  );

  return result.rows.map((row) => ({
    ...row,
    price: Number(row.price),
    priceChangePercent: Number(row.priceChangePercent),
    volume: Number(row.volume),
    quoteVolume: Number(row.quoteVolume),
    tradeCount: Number(row.tradeCount),
  }));
}

module.exports = {
  getSymbols,
  getCandles,
  getTickers,
  parseBoolean,
};
