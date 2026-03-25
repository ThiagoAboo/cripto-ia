const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');

function getDefaultStartingBalance(baseCurrency = 'USDT') {
  if (baseCurrency === 'BRL') return 50000;
  if (baseCurrency === 'BTC') return 1;
  return 10000;
}

function getAccountKey(config) {
  const baseCurrency = config?.trading?.baseCurrency || 'USDT';
  return `paper:${baseCurrency}`;
}

function getPaperSettings(config = {}) {
  const baseCurrency = config?.trading?.baseCurrency || 'USDT';
  const paper = config?.execution?.paper || {};

  return {
    accountKey: getAccountKey(config),
    mode: config?.trading?.mode || 'paper',
    baseCurrency,
    initialCapital: Number(paper.initialCapital || getDefaultStartingBalance(baseCurrency)),
    orderSizePct: Number(paper.orderSizePct || 10),
    minOrderNotional: Number(paper.minOrderNotional || 50),
    feePct: Number(paper.feePct || 0.1),
    slippagePct: Number(paper.slippagePct || 0.05),
    allowMultipleEntriesPerSymbol: Boolean(paper.allowMultipleEntriesPerSymbol),
    sellFractionOnSignal: Number(paper.sellFractionOnSignal || 1),
    maxOpenPositions: Number(config?.trading?.maxOpenPositions || 5),
    maxPortfolioExposurePct: Number(config?.risk?.maxPortfolioExposurePct || 35),
    maxSymbolExposurePct: Number(config?.risk?.maxSymbolExposurePct || 12),
    allowAveragingDown: Boolean(config?.risk?.allowAveragingDown),
    stopLossAtr: Number(config?.risk?.stopLossAtr || 1.8),
    takeProfitAtr: Number(config?.risk?.takeProfitAtr || 2.6),
    trailingStopAtr: Number(config?.risk?.trailingStopAtr || 1.2),
    enableTrailingStop: Boolean(config?.risk?.enableTrailingStop ?? true),
  };
}

async function ensurePaperAccount(client, config) {
  const settings = getPaperSettings(config);

  await client.query(
    `
      INSERT INTO paper_accounts (
        account_key,
        mode,
        base_currency,
        starting_balance,
        cash_balance,
        realized_pnl,
        fees_paid,
        last_equity,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, 'paper', $2, $3, $3, 0, 0, $3, $4::jsonb, NOW(), NOW())
      ON CONFLICT (account_key) DO NOTHING
    `,
    [
      settings.accountKey,
      settings.baseCurrency,
      settings.initialCapital,
      JSON.stringify({ seededBy: 'schema', initialCapital: settings.initialCapital }),
    ],
  );

  const result = await client.query(
    `
      SELECT
        account_key AS "accountKey",
        mode,
        base_currency AS "baseCurrency",
        starting_balance AS "startingBalance",
        cash_balance AS "cashBalance",
        realized_pnl AS "realizedPnl",
        fees_paid AS "feesPaid",
        last_equity AS "lastEquity",
        updated_at AS "updatedAt"
      FROM paper_accounts
      WHERE account_key = $1
      LIMIT 1
    `,
    [settings.accountKey],
  );

  return result.rows[0];
}

function normalizePositionRow(row) {
  return {
    ...row,
    quantity: Number(row.quantity),
    avgEntryPrice: Number(row.avgEntryPrice),
    costBasis: Number(row.costBasis),
    lastPrice: Number(row.lastPrice),
    marketValue: Number(row.marketValue),
    unrealizedPnl: Number(row.unrealizedPnl),
    realizedPnl: Number(row.realizedPnl),
    stopLossPrice: Number(row.stopLossPrice || 0),
    takeProfitPrice: Number(row.takeProfitPrice || 0),
    trailingStopPrice: Number(row.trailingStopPrice || 0),
    highestPrice: Number(row.highestPrice || 0),
    atrAtEntry: Number(row.atrAtEntry || 0),
  };
}

async function getPaperSummary(configOverride = null) {
  const configRow = configOverride ? { config: configOverride } : await getActiveConfig();
  const config = configRow?.config || {};
  const settings = getPaperSettings(config);

  const accountResult = await pool.query(
    `
      SELECT
        account_key AS "accountKey",
        mode,
        base_currency AS "baseCurrency",
        starting_balance AS "startingBalance",
        cash_balance AS "cashBalance",
        realized_pnl AS "realizedPnl",
        fees_paid AS "feesPaid",
        last_equity AS "lastEquity",
        updated_at AS "updatedAt"
      FROM paper_accounts
      WHERE account_key = $1
      LIMIT 1
    `,
    [settings.accountKey],
  );

  if (!accountResult.rows.length) {
    const client = await pool.connect();
    try {
      await ensurePaperAccount(client, config);
    } finally {
      client.release();
    }
  }

  const accountRow = (await pool.query(
    `
      SELECT
        account_key AS "accountKey",
        mode,
        base_currency AS "baseCurrency",
        starting_balance AS "startingBalance",
        cash_balance AS "cashBalance",
        realized_pnl AS "realizedPnl",
        fees_paid AS "feesPaid",
        last_equity AS "lastEquity",
        updated_at AS "updatedAt"
      FROM paper_accounts
      WHERE account_key = $1
      LIMIT 1
    `,
    [settings.accountKey],
  )).rows[0];

  const positionsResult = await pool.query(
    `
      SELECT
        p.symbol,
        p.status,
        p.quantity,
        p.avg_entry_price AS "avgEntryPrice",
        p.cost_basis AS "costBasis",
        COALESCE(mt.price, p.last_price) AS "lastPrice",
        (p.quantity * COALESCE(mt.price, p.last_price)) AS "marketValue",
        ((p.quantity * COALESCE(mt.price, p.last_price)) - p.cost_basis) AS "unrealizedPnl",
        p.realized_pnl AS "realizedPnl",
        p.stop_loss_price AS "stopLossPrice",
        p.take_profit_price AS "takeProfitPrice",
        p.trailing_stop_price AS "trailingStopPrice",
        p.highest_price AS "highestPrice",
        p.atr_at_entry AS "atrAtEntry",
        p.risk_status AS "riskStatus",
        p.metadata,
        p.opened_at AS "openedAt",
        p.updated_at AS "updatedAt"
      FROM paper_positions p
      LEFT JOIN market_tickers mt ON mt.symbol = p.symbol
      WHERE p.account_key = $1 AND p.status = 'OPEN'
      ORDER BY p.symbol ASC
    `,
    [settings.accountKey],
  );

  const positions = positionsResult.rows.map(normalizePositionRow);

  const cashBalance = Number(accountRow.cashBalance);
  const positionsValue = positions.reduce((sum, item) => sum + item.marketValue, 0);
  const unrealizedPnl = positions.reduce((sum, item) => sum + item.unrealizedPnl, 0);
  const realizedPnl = Number(accountRow.realizedPnl);
  const feesPaid = Number(accountRow.feesPaid);
  const startingBalance = Number(accountRow.startingBalance);
  const equity = cashBalance + positionsValue;
  const openPositionsCount = positions.length;
  const exposurePct = equity > 0 ? (positionsValue / equity) * 100 : 0;

  return {
    accountKey: accountRow.accountKey,
    mode: accountRow.mode,
    baseCurrency: accountRow.baseCurrency,
    startingBalance,
    cashBalance,
    positionsValue,
    equity,
    realizedPnl,
    unrealizedPnl,
    feesPaid,
    exposurePct,
    openPositionsCount,
    openSymbols: positions.map((item) => item.symbol),
    positions,
    updatedAt: accountRow.updatedAt,
  };
}

async function listPaperOrders({ limit = 50 } = {}, configOverride = null) {
  const configRow = configOverride ? { config: configOverride } : await getActiveConfig();
  const settings = getPaperSettings(configRow?.config || {});
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const result = await pool.query(
    `
      SELECT
        id,
        account_key AS "accountKey",
        worker_name AS "workerName",
        symbol,
        side,
        status,
        requested_notional AS "requestedNotional",
        executed_notional AS "executedNotional",
        requested_quantity AS "requestedQuantity",
        executed_quantity AS "executedQuantity",
        price,
        fee_amount AS "feeAmount",
        slippage_pct AS "slippagePct",
        realized_pnl AS "realizedPnl",
        pnl_pct AS "pnlPct",
        reason,
        rejection_reason AS "rejectionReason",
        linked_decision_id AS "linkedDecisionId",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM paper_orders
      WHERE account_key = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [settings.accountKey, safeLimit],
  );

  return result.rows.map((row) => ({
    ...row,
    requestedNotional: Number(row.requestedNotional),
    executedNotional: Number(row.executedNotional),
    requestedQuantity: Number(row.requestedQuantity),
    executedQuantity: Number(row.executedQuantity),
    price: Number(row.price),
    feeAmount: Number(row.feeAmount),
    slippagePct: Number(row.slippagePct),
    realizedPnl: Number(row.realizedPnl || 0),
    pnlPct: Number(row.pnlPct || 0),
  }));
}

async function listRecentDecisions({ limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const result = await pool.query(
    `
      SELECT
        id,
        worker_name AS "workerName",
        symbol,
        action,
        confidence,
        blocked,
        reason,
        payload,
        created_at AS "createdAt"
      FROM ai_decisions
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map((row) => ({
    ...row,
    confidence: Number(row.confidence),
  }));
}

module.exports = {
  getAccountKey,
  getPaperSettings,
  ensurePaperAccount,
  getPaperSummary,
  listPaperOrders,
  listRecentDecisions,
};
