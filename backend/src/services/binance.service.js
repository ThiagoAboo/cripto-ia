const env = require('../config/env');

function buildUrl(pathname, params = {}) {
  const url = new URL(`${env.market.binanceApiBaseUrl}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

async function httpGetJson(pathname, params = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(buildUrl(pathname, params), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`binance_request_failed:${response.status}:${text.slice(0, 300)}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExchangeInfo({ quoteAsset = 'USDT' } = {}) {
  const payload = await httpGetJson('/api/v3/exchangeInfo', {
    permissions: 'SPOT',
    symbolStatus: 'TRADING',
  });

  return (payload.symbols || []).filter(
    (item) => item.quoteAsset === quoteAsset && item.status === 'TRADING',
  );
}

async function fetchKlines({ symbol, interval = '5m', limit = env.market.defaultCandleLimit }) {
  return httpGetJson('/api/v3/klines', {
    symbol,
    interval,
    limit,
  });
}

async function fetch24hrTickers({ symbols = [] } = {}) {
  if (!symbols.length) return [];

  if (symbols.length === 1) {
    const single = await httpGetJson('/api/v3/ticker/24hr', {
      symbol: symbols[0],
    });

    return [single];
  }

  return httpGetJson('/api/v3/ticker/24hr', {
    symbols: JSON.stringify(symbols),
  });
}

module.exports = {
  fetchExchangeInfo,
  fetchKlines,
  fetch24hrTickers,
};
