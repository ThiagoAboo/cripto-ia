const pool = require('../db/pool');
const { getOptimizationRunById } = require('./optimizer.service');
const { deepMerge } = require('./backtest.service');
const { getActiveConfig, normalizeConfig, updateActiveConfig } = require('./config.service');

function normalizePromotionRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    sourceRunId: row.sourceRunId !== null && row.sourceRunId !== undefined ? Number(row.sourceRunId) : null,
    sourceResultRank: Number(row.sourceResultRank || 1),
    appliedVersion: row.appliedVersion !== null && row.appliedVersion !== undefined ? Number(row.appliedVersion) : null,
  };
}

async function listPromotions({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const result = await pool.query(
    `
      SELECT
        id,
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        approved_by AS "approvedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        applied_at AS "appliedAt"
      FROM config_promotions
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map(normalizePromotionRow);
}

async function createPromotionRecord({
  sourceType,
  sourceRunId = null,
  sourceResultRank = 1,
  targetChannel,
  status,
  approvedBy = 'dashboard',
  reason = null,
  summary = {},
  configOverride = {},
  promotedConfig = {},
  appliedVersion = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO config_promotions (
        source_type,
        source_run_id,
        source_result_rank,
        target_channel,
        status,
        approved_by,
        reason,
        summary,
        config_override,
        promoted_config,
        applied_version,
        created_at,
        applied_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, NOW(), CASE WHEN $5 = 'applied' THEN NOW() ELSE NULL END)
      RETURNING
        id,
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        approved_by AS "approvedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        applied_at AS "appliedAt"
    `,
    [
      sourceType,
      sourceRunId,
      sourceResultRank,
      targetChannel,
      status,
      approvedBy,
      reason,
      JSON.stringify(summary || {}),
      JSON.stringify(configOverride || {}),
      JSON.stringify(promotedConfig || {}),
      appliedVersion,
    ],
  );

  return normalizePromotionRow(result.rows[0]);
}

async function promoteOptimizationWinner({
  optimizationRunId,
  rank = 1,
  targetChannel = 'paper_active',
  approvedBy = 'dashboard',
  reason = null,
}) {
  const optimizationRun = await getOptimizationRunById(Number(optimizationRunId));
  if (!optimizationRun) {
    throw new Error('optimization_not_found');
  }

  const safeRank = Math.max(1, Number(rank) || 1);
  const winner = optimizationRun.items.find((item) => Number(item.rank) === safeRank) || optimizationRun.items[0] || null;
  if (!winner) {
    throw new Error('optimization_winner_not_found');
  }

  const activeConfigRow = await getActiveConfig();
  const activeConfig = activeConfigRow?.config || {};
  const promotedConfig = normalizeConfig(deepMerge(activeConfig, winner.configOverride || {}));

  promotedConfig.trading = {
    ...promotedConfig.trading,
    mode: 'paper',
  };
  promotedConfig.execution = {
    ...promotedConfig.execution,
    live: {
      ...(promotedConfig.execution?.live || {}),
      enabled: false,
    },
  };

  const summary = {
    optimizationRunId: Number(optimizationRun.id),
    optimizationLabel: optimizationRun.label,
    objective: optimizationRun.objective,
    candidateName: winner.candidateName,
    symbol: winner.symbol,
    regimeLabel: winner.regimeLabel,
    score: Number(winner.score || 0),
    metrics: winner.metrics || {},
  };

  let updatedConfig = null;
  let promotionStatus = 'staged';
  let appliedVersion = null;

  if (String(targetChannel || 'paper_active') === 'paper_active') {
    updatedConfig = await updateActiveConfig(promotedConfig, {
      actionType: 'promotion_apply_optimizer_winner',
      actor: approvedBy,
      sourceType: 'optimizer',
      sourceId: Number(optimizationRun.id),
      reason: reason || `winner:${winner.candidateName}`,
      metadata: summary,
    });
    promotionStatus = 'applied';
    appliedVersion = Number(updatedConfig.version || 0);
  } else {
    promotionStatus = 'staged_live_candidate';
  }

  const promotion = await createPromotionRecord({
    sourceType: 'optimizer',
    sourceRunId: Number(optimizationRun.id),
    sourceResultRank: Number(winner.rank || safeRank),
    targetChannel: String(targetChannel || 'paper_active'),
    status: promotionStatus,
    approvedBy,
    reason,
    summary,
    configOverride: winner.configOverride || {},
    promotedConfig,
    appliedVersion,
  });

  return {
    promotion,
    winner,
    updatedConfig,
  };
}

module.exports = {
  listPromotions,
  promoteOptimizationWinner,
};
