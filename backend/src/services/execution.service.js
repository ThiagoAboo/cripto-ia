const pool = require('../db/pool');
const { getActiveConfig } = require('./config.service');
const { getPaperSettings, ensurePaperAccount } = require('./portfolio.service');
const { getTickers } = require('./market.service');

function roundTo(value, decimals = 12) {
  return Number(Number(value || 0).toFixed(decimals));
}

async function refreshPrice(symbol) {
  const tickers = await getTickers({ symbols: [symbol], refresh: true });
  const ticker = tickers[0];

  if (!ticker || !Number(ticker.price)) {
    throw new Error(`price_unavailable_for_${symbol}`);
  }

  return Number(ticker.price);
}

function extractRiskPayload(payload = {}, settings = {}) {
  const risk = payload.risk || {};
  return {
    atr: Number(risk.atr || payload.atr || 0),
    stopLossPrice: Number(risk.stopLossPrice || payload.stopLossPrice || 0),
    takeProfitPrice: Number(risk.takeProfitPrice || payload.takeProfitPrice || 0),
    trailingStopPrice: Number(risk.trailingStopPrice || payload.trailingStopPrice || 0),
    highestPrice: Number(risk.highestPrice || payload.highestPrice || 0),
    enableTrailingStop: risk.enableTrailingStop ?? settings.enableTrailingStop,
    riskStatus: String(risk.riskStatus || payload.riskStatus || 'NORMAL').toUpperCase(),
  };
}

async function createRejectedOrder(client, {
  accountKey,
  workerName,
  symbol,
  side,
  requestedNotional = 0,
  requestedQuantity = 0,
  reason = null,
  rejectionReason,
  linkedDecisionId = null,
  payload = {},
  slippagePct = 0,
}) {
  const result = await client.query(
    `
      INSERT INTO paper_orders (
        account_key,
        worker_name,
        symbol,
        side,
        status,
        requested_notional,
        executed_notional,
        requested_quantity,
        executed_quantity,
        price,
        fee_amount,
        slippage_pct,
        reason,
        rejection_reason,
        linked_decision_id,
        payload,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'REJECTED', $5, 0, $6, 0, 0, 0, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
      RETURNING
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
        reason,
        rejection_reason AS "rejectionReason",
        linked_decision_id AS "linkedDecisionId",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      accountKey,
      workerName,
      symbol,
      side,
      requestedNotional,
      requestedQuantity,
      slippagePct,
      reason,
      rejectionReason,
      linkedDecisionId,
      JSON.stringify(payload),
    ],
  );

  const row = result.rows[0];
  return {
    ...row,
    requestedNotional: Number(row.requestedNotional),
    executedNotional: Number(row.executedNotional),
    requestedQuantity: Number(row.requestedQuantity),
    executedQuantity: Number(row.executedQuantity),
    price: Number(row.price),
    feeAmount: Number(row.feeAmount),
    slippagePct: Number(row.slippagePct),
  };
}

async function createFilledOrder(client, {
  accountKey,
  workerName,
  symbol,
  side,
  requestedNotional,
  executedNotional,
  requestedQuantity,
  executedQuantity,
  price,
  feeAmount,
  slippagePct,
  reason,
  linkedDecisionId = null,
  payload = {},
}) {
  const result = await client.query(
    `
      INSERT INTO paper_orders (
        account_key,
        worker_name,
        symbol,
        side,
        status,
        requested_notional,
        executed_notional,
        requested_quantity,
        executed_quantity,
        price,
        fee_amount,
        slippage_pct,
        reason,
        linked_decision_id,
        payload,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'FILLED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
      RETURNING
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
        reason,
        rejection_reason AS "rejectionReason",
        linked_decision_id AS "linkedDecisionId",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      accountKey,
      workerName,
      symbol,
      side,
      requestedNotional,
      executedNotional,
      requestedQuantity,
      executedQuantity,
      price,
      feeAmount,
      slippagePct,
      reason,
      linkedDecisionId,
      JSON.stringify(payload),
    ],
  );

  const row = result.rows[0];
  return {
    ...row,
    requestedNotional: Number(row.requestedNotional),
    executedNotional: Number(row.executedNotional),
    requestedQuantity: Number(row.requestedQuantity),
    executedQuantity: Number(row.executedQuantity),
    price: Number(row.price),
    feeAmount: Number(row.feeAmount),
    slippagePct: Number(row.slippagePct),
  };
}

async function snapshotPortfolio(client, accountKey) {
  const accountResult = await client.query(
    `
      SELECT cash_balance, realized_pnl
      FROM paper_accounts
      WHERE account_key = $1
      LIMIT 1
    `,
    [accountKey],
  );

  const positionsResult = await client.query(
    `
      SELECT
        p.symbol,
        p.quantity,
        p.cost_basis,
        p.highest_price,
        p.trailing_stop_price,
        COALESCE(mt.price, p.last_price, 0) AS mark_price
      FROM paper_positions p
      LEFT JOIN market_tickers mt ON mt.symbol = p.symbol
      WHERE p.account_key = $1 AND p.status = 'OPEN'
    `,
    [accountKey],
  );

  let positionsValue = 0;
  let unrealizedPnl = 0;

  for (const row of positionsResult.rows) {
    const quantity = Number(row.quantity);
    const markPrice = Number(row.mark_price || 0);
    const costBasis = Number(row.cost_basis || 0);
    const marketValue = quantity * markPrice;
    const positionUnrealized = marketValue - costBasis;
    positionsValue += marketValue;
    unrealizedPnl += positionUnrealized;

    await client.query(
      `
        UPDATE paper_positions
        SET last_price = $3,
            market_value = $4,
            unrealized_pnl = $5,
            updated_at = NOW()
        WHERE account_key = $1 AND symbol = $2
      `,
      [accountKey, row.symbol, markPrice, marketValue, positionUnrealized],
    );
  }

  const cashBalance = Number(accountResult.rows[0]?.cash_balance || 0);
  const realizedPnl = Number(accountResult.rows[0]?.realized_pnl || 0);
  const equity = cashBalance + positionsValue;

  await client.query(
    `
      UPDATE paper_accounts
      SET last_equity = $2,
          updated_at = NOW()
      WHERE account_key = $1
    `,
    [accountKey, equity],
  );

  await client.query(
    `
      INSERT INTO portfolio_snapshots (
        account_key,
        cash_balance,
        positions_value,
        equity,
        realized_pnl,
        unrealized_pnl,
        open_positions_count,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
    [accountKey, cashBalance, positionsValue, equity, realizedPnl, unrealizedPnl, positionsResult.rows.length],
  );
}

async function syncPaperPositionRisk({
  symbol,
  highestPrice = null,
  trailingStopPrice = null,
  stopLossPrice = null,
  takeProfitPrice = null,
  riskStatus = null,
  metadataPatch = {},
}) {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('symbol_required');
  }

  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const settings = getPaperSettings(config);

  const result = await pool.query(
    `
      UPDATE paper_positions
      SET highest_price = COALESCE($3, highest_price),
          trailing_stop_price = COALESCE($4, trailing_stop_price),
          stop_loss_price = COALESCE($5, stop_loss_price),
          take_profit_price = COALESCE($6, take_profit_price),
          risk_status = COALESCE($7, risk_status),
          metadata = COALESCE(metadata, '{}'::jsonb) || $8::jsonb,
          updated_at = NOW()
      WHERE account_key = $1 AND symbol = $2 AND status = 'OPEN'
      RETURNING
        account_key AS "accountKey",
        symbol,
        highest_price AS "highestPrice",
        trailing_stop_price AS "trailingStopPrice",
        stop_loss_price AS "stopLossPrice",
        take_profit_price AS "takeProfitPrice",
        risk_status AS "riskStatus",
        metadata,
        updated_at AS "updatedAt"
    `,
    [
      settings.accountKey,
      normalizedSymbol,
      highestPrice,
      trailingStopPrice,
      stopLossPrice,
      takeProfitPrice,
      riskStatus,
      JSON.stringify(metadataPatch || {}),
    ],
  );

  return result.rows[0] || null;
}

async function executePaperOrder({
  workerName,
  symbol,
  side,
  reason = null,
  linkedDecisionId = null,
  requestedNotional = null,
  requestedQuantity = null,
  payload = {},
}) {
  const normalizedSide = String(side || '').toUpperCase();
  const normalizedSymbol = String(symbol || '').toUpperCase();

  if (!normalizedSymbol || !['BUY', 'SELL'].includes(normalizedSide)) {
    throw new Error('invalid_order_request');
  }

  const configRow = await getActiveConfig();
  const config = configRow?.config || {};
  const settings = getPaperSettings(config);
  const tradingEnabled = Boolean(config?.trading?.enabled);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensurePaperAccount(client, config);

    if (!tradingEnabled) {
      const rejected = await createRejectedOrder(client, {
        accountKey: settings.accountKey,
        workerName,
        symbol: normalizedSymbol,
        side: normalizedSide,
        requestedNotional: Number(requestedNotional || 0),
        requestedQuantity: Number(requestedQuantity || 0),
        reason,
        rejectionReason: 'trading_disabled',
        linkedDecisionId,
        payload,
        slippagePct: settings.slippagePct,
      });
      await client.query('COMMIT');
      return rejected;
    }

    if ((config?.trading?.mode || 'paper') !== 'paper') {
      const rejected = await createRejectedOrder(client, {
        accountKey: settings.accountKey,
        workerName,
        symbol: normalizedSymbol,
        side: normalizedSide,
        requestedNotional: Number(requestedNotional || 0),
        requestedQuantity: Number(requestedQuantity || 0),
        reason,
        rejectionReason: 'paper_mode_required',
        linkedDecisionId,
        payload,
        slippagePct: settings.slippagePct,
      });
      await client.query('COMMIT');
      return rejected;
    }

    const accountResult = await client.query(
      `
        SELECT cash_balance, realized_pnl, fees_paid
        FROM paper_accounts
        WHERE account_key = $1
        LIMIT 1
      `,
      [settings.accountKey],
    );

    const positionResult = await client.query(
      `
        SELECT symbol, quantity, avg_entry_price, cost_basis, realized_pnl
        FROM paper_positions
        WHERE account_key = $1 AND symbol = $2 AND status = 'OPEN'
        LIMIT 1
      `,
      [settings.accountKey, normalizedSymbol],
    );

    const position = positionResult.rows[0] || null;
    const priceSource = await refreshPrice(normalizedSymbol);
    const slippageFactor = 1 + ((normalizedSide === 'BUY' ? 1 : -1) * settings.slippagePct / 100);
    const executionPrice = priceSource * slippageFactor;
    const feeRate = settings.feePct / 100;
    const risk = extractRiskPayload(payload, settings);

    const account = accountResult.rows[0];
    const cashBalance = Number(account.cash_balance || 0);

    const openPositionsCountResult = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM paper_positions
        WHERE account_key = $1 AND status = 'OPEN'
      `,
      [settings.accountKey],
    );
    const openPositionsCount = Number(openPositionsCountResult.rows[0]?.count || 0);

    const exposureResult = await client.query(
      `
        SELECT
          COALESCE(SUM(p.quantity * COALESCE(mt.price, p.last_price, 0)), 0) AS positions_value
        FROM paper_positions p
        LEFT JOIN market_tickers mt ON mt.symbol = p.symbol
        WHERE p.account_key = $1 AND p.status = 'OPEN'
      `,
      [settings.accountKey],
    );
    const positionsValue = Number(exposureResult.rows[0]?.positions_value || 0);
    const equity = cashBalance + positionsValue;
    const currentExposurePct = equity > 0 ? (positionsValue / equity) * 100 : 0;
    const symbolExposureCap = equity * (settings.maxSymbolExposurePct / 100);

    if (normalizedSide === 'BUY') {
      if ((position && !settings.allowMultipleEntriesPerSymbol) || (position && !settings.allowAveragingDown)) {
        const rejected = await createRejectedOrder(client, {
          accountKey: settings.accountKey,
          workerName,
          symbol: normalizedSymbol,
          side: normalizedSide,
          requestedNotional: Number(requestedNotional || 0),
          requestedQuantity: Number(requestedQuantity || 0),
          reason,
          rejectionReason: 'position_already_open',
          linkedDecisionId,
          payload,
          slippagePct: settings.slippagePct,
        });
        await client.query('COMMIT');
        return rejected;
      }

      if (currentExposurePct >= settings.maxPortfolioExposurePct) {
        const rejected = await createRejectedOrder(client, {
          accountKey: settings.accountKey,
          workerName,
          symbol: normalizedSymbol,
          side: normalizedSide,
          requestedNotional: Number(requestedNotional || 0),
          requestedQuantity: Number(requestedQuantity || 0),
          reason,
          rejectionReason: 'portfolio_exposure_limit_reached',
          linkedDecisionId,
          payload,
          slippagePct: settings.slippagePct,
        });
        await client.query('COMMIT');
        return rejected;
      }

      if (!position && openPositionsCount >= settings.maxOpenPositions) {
        const rejected = await createRejectedOrder(client, {
          accountKey: settings.accountKey,
          workerName,
          symbol: normalizedSymbol,
          side: normalizedSide,
          requestedNotional: Number(requestedNotional || 0),
          requestedQuantity: Number(requestedQuantity || 0),
          reason,
          rejectionReason: 'max_open_positions_reached',
          linkedDecisionId,
          payload,
          slippagePct: settings.slippagePct,
        });
        await client.query('COMMIT');
        return rejected;
      }

      let plannedNotional = Number(requestedNotional || 0);
      if (!plannedNotional) {
        plannedNotional = cashBalance * (settings.orderSizePct / 100);
      }

      const existingMarketValue = Number(position ? (position.quantity * executionPrice) : 0);
      const maxAllowedForSymbol = Math.max(0, symbolExposureCap - existingMarketValue);
      plannedNotional = Math.min(plannedNotional, cashBalance, maxAllowedForSymbol || plannedNotional);

      if (plannedNotional <= 0 || plannedNotional < settings.minOrderNotional) {
        const rejected = await createRejectedOrder(client, {
          accountKey: settings.accountKey,
          workerName,
          symbol: normalizedSymbol,
          side: normalizedSide,
          requestedNotional: plannedNotional,
          requestedQuantity: 0,
          reason,
          rejectionReason: 'notional_below_minimum',
          linkedDecisionId,
          payload,
          slippagePct: settings.slippagePct,
        });
        await client.query('COMMIT');
        return rejected;
      }

      let feeAmount = plannedNotional * feeRate;
      let totalCashRequired = plannedNotional + feeAmount;

      if (totalCashRequired > cashBalance) {
        plannedNotional = cashBalance / (1 + feeRate);
        feeAmount = plannedNotional * feeRate;
        totalCashRequired = plannedNotional + feeAmount;
      }

      if (plannedNotional < settings.minOrderNotional || totalCashRequired > cashBalance) {
        const rejected = await createRejectedOrder(client, {
          accountKey: settings.accountKey,
          workerName,
          symbol: normalizedSymbol,
          side: normalizedSide,
          requestedNotional: plannedNotional,
          requestedQuantity: 0,
          reason,
          rejectionReason: 'insufficient_cash',
          linkedDecisionId,
          payload,
          slippagePct: settings.slippagePct,
        });
        await client.query('COMMIT');
        return rejected;
      }

      const executedQuantity = plannedNotional / executionPrice;
      const currentQuantity = Number(position?.quantity || 0);
      const currentCostBasis = Number(position?.cost_basis || 0);
      const nextQuantity = currentQuantity + executedQuantity;
      const nextCostBasis = currentCostBasis + totalCashRequired;
      const nextAvgEntryPrice = nextQuantity > 0 ? nextCostBasis / nextQuantity : executionPrice;
      const stopLossPrice = risk.stopLossPrice || 0;
      const takeProfitPrice = risk.takeProfitPrice || 0;
      const trailingStopPrice = risk.enableTrailingStop ? (risk.trailingStopPrice || 0) : 0;
      const highestPrice = Math.max(executionPrice, risk.highestPrice || executionPrice);
      const atrAtEntry = risk.atr || 0;

      if (position) {
        await client.query(
          `
            UPDATE paper_positions
            SET quantity = $3,
                avg_entry_price = $4,
                cost_basis = $5,
                last_price = $6,
                market_value = $7,
                unrealized_pnl = $8,
                stop_loss_price = COALESCE(NULLIF($9, 0), stop_loss_price),
                take_profit_price = COALESCE(NULLIF($10, 0), take_profit_price),
                trailing_stop_price = COALESCE(NULLIF($11, 0), trailing_stop_price),
                highest_price = GREATEST(COALESCE(highest_price, 0), $12),
                atr_at_entry = COALESCE(NULLIF($13, 0), atr_at_entry),
                risk_status = $14,
                updated_at = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb) || $15::jsonb
            WHERE account_key = $1 AND symbol = $2
          `,
          [
            settings.accountKey,
            normalizedSymbol,
            nextQuantity,
            nextAvgEntryPrice,
            nextCostBasis,
            executionPrice,
            nextQuantity * executionPrice,
            (nextQuantity * executionPrice) - nextCostBasis,
            stopLossPrice,
            takeProfitPrice,
            trailingStopPrice,
            highestPrice,
            atrAtEntry,
            risk.riskStatus,
            JSON.stringify({ lastAction: 'BUY', lastReason: reason, risk }),
          ],
        );
      } else {
        await client.query(
          `
            INSERT INTO paper_positions (
              account_key,
              symbol,
              status,
              quantity,
              avg_entry_price,
              cost_basis,
              last_price,
              market_value,
              unrealized_pnl,
              realized_pnl,
              stop_loss_price,
              take_profit_price,
              trailing_stop_price,
              highest_price,
              atr_at_entry,
              risk_status,
              metadata,
              opened_at,
              updated_at
            )
            VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, $15::jsonb, NOW(), NOW())
          `,
          [
            settings.accountKey,
            normalizedSymbol,
            nextQuantity,
            nextAvgEntryPrice,
            nextCostBasis,
            executionPrice,
            nextQuantity * executionPrice,
            (nextQuantity * executionPrice) - nextCostBasis,
            stopLossPrice,
            takeProfitPrice,
            trailingStopPrice,
            highestPrice,
            atrAtEntry,
            risk.riskStatus,
            JSON.stringify({ openedBy: workerName, lastReason: reason, risk }),
          ],
        );
      }

      await client.query(
        `
          UPDATE paper_accounts
          SET cash_balance = cash_balance - $2,
              fees_paid = fees_paid + $3,
              updated_at = NOW()
          WHERE account_key = $1
        `,
        [settings.accountKey, totalCashRequired, feeAmount],
      );

      const order = await createFilledOrder(client, {
        accountKey: settings.accountKey,
        workerName,
        symbol: normalizedSymbol,
        side: normalizedSide,
        requestedNotional: plannedNotional,
        executedNotional: plannedNotional,
        requestedQuantity: executedQuantity,
        executedQuantity,
        price: executionPrice,
        feeAmount,
        slippagePct: settings.slippagePct,
        reason,
        linkedDecisionId,
        payload: {
          ...payload,
          accountMode: 'paper',
          grossNotional: roundTo(plannedNotional),
          totalCashRequired: roundTo(totalCashRequired),
          risk: {
            atr: roundTo(atrAtEntry),
            stopLossPrice: roundTo(stopLossPrice),
            takeProfitPrice: roundTo(takeProfitPrice),
            trailingStopPrice: roundTo(trailingStopPrice),
            highestPrice: roundTo(highestPrice),
            riskStatus: risk.riskStatus,
          },
        },
      });

      await snapshotPortfolio(client, settings.accountKey);
      await client.query('COMMIT');
      return order;
    }

    if (!position || Number(position.quantity || 0) <= 0) {
      const rejected = await createRejectedOrder(client, {
        accountKey: settings.accountKey,
        workerName,
        symbol: normalizedSymbol,
        side: normalizedSide,
        requestedNotional: Number(requestedNotional || 0),
        requestedQuantity: Number(requestedQuantity || 0),
        reason,
        rejectionReason: 'no_open_position',
        linkedDecisionId,
        payload,
        slippagePct: settings.slippagePct,
      });
      await client.query('COMMIT');
      return rejected;
    }

    const currentQuantity = Number(position.quantity || 0);
    const sellFraction = Math.min(Math.max(settings.sellFractionOnSignal || 1, 0.01), 1);
    let quantityToSell = Number(requestedQuantity || 0);
    if (!quantityToSell) {
      quantityToSell = currentQuantity * sellFraction;
    }
    quantityToSell = Math.min(quantityToSell, currentQuantity);

    if (quantityToSell <= 0) {
      const rejected = await createRejectedOrder(client, {
        accountKey: settings.accountKey,
        workerName,
        symbol: normalizedSymbol,
        side: normalizedSide,
        requestedNotional: Number(requestedNotional || 0),
        requestedQuantity: quantityToSell,
        reason,
        rejectionReason: 'invalid_sell_quantity',
        linkedDecisionId,
        payload,
        slippagePct: settings.slippagePct,
      });
      await client.query('COMMIT');
      return rejected;
    }

    const grossProceeds = quantityToSell * executionPrice;
    const feeAmount = grossProceeds * feeRate;
    const netProceeds = grossProceeds - feeAmount;
    const currentCostBasis = Number(position.cost_basis || 0);
    const proportionalCostBasis = currentCostBasis * (quantityToSell / currentQuantity);
    const realizedPnl = netProceeds - proportionalCostBasis;
    const remainingQuantity = currentQuantity - quantityToSell;
    const remainingCostBasis = currentCostBasis - proportionalCostBasis;

    if (remainingQuantity <= 1e-10) {
      await client.query(
        `
          DELETE FROM paper_positions
          WHERE account_key = $1 AND symbol = $2
        `,
        [settings.accountKey, normalizedSymbol],
      );
    } else {
      const nextAvgEntryPrice = remainingCostBasis / remainingQuantity;
      await client.query(
        `
          UPDATE paper_positions
          SET quantity = $3,
              avg_entry_price = $4,
              cost_basis = $5,
              last_price = $6,
              market_value = $7,
              unrealized_pnl = $8,
              realized_pnl = realized_pnl + $9,
              updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || $10::jsonb
          WHERE account_key = $1 AND symbol = $2
        `,
        [
          settings.accountKey,
          normalizedSymbol,
          remainingQuantity,
          nextAvgEntryPrice,
          remainingCostBasis,
          executionPrice,
          remainingQuantity * executionPrice,
          (remainingQuantity * executionPrice) - remainingCostBasis,
          realizedPnl,
          JSON.stringify({ lastAction: 'SELL', lastReason: reason, risk: extractRiskPayload(payload, settings) }),
        ],
      );
    }

    await client.query(
      `
        UPDATE paper_accounts
        SET cash_balance = cash_balance + $2,
            realized_pnl = realized_pnl + $3,
            fees_paid = fees_paid + $4,
            updated_at = NOW()
        WHERE account_key = $1
      `,
      [settings.accountKey, netProceeds, realizedPnl, feeAmount],
    );

    const order = await createFilledOrder(client, {
      accountKey: settings.accountKey,
      workerName,
      symbol: normalizedSymbol,
      side: normalizedSide,
      requestedNotional: Number(requestedNotional || grossProceeds),
      executedNotional: grossProceeds,
      requestedQuantity: quantityToSell,
      executedQuantity: quantityToSell,
      price: executionPrice,
      feeAmount,
      slippagePct: settings.slippagePct,
      reason,
      linkedDecisionId,
      payload: {
        ...payload,
        accountMode: 'paper',
        netProceeds: roundTo(netProceeds),
        realizedPnl: roundTo(realizedPnl),
      },
    });

    await snapshotPortfolio(client, settings.accountKey);
    await client.query('COMMIT');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  executePaperOrder,
  syncPaperPositionRisk,
};
