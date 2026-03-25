const pool = require('../db/pool');
const { getOptimizationRunById } = require('./optimizer.service');
const { deepMerge } = require('./backtest.service');
const { getActiveConfig, getConfigVersion, normalizeConfig, updateActiveConfig } = require('./config.service');

function normalizePromotionRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    sourceRunId: row.sourceRunId !== null && row.sourceRunId !== undefined ? Number(row.sourceRunId) : null,
    sourceResultRank: Number(row.sourceResultRank || 1),
    appliedVersion: row.appliedVersion !== null && row.appliedVersion !== undefined ? Number(row.appliedVersion) : null,
    appliedPromotionId: row.appliedPromotionId !== null && row.appliedPromotionId !== undefined ? Number(row.appliedPromotionId) : null,
  };
}

function normalizeApprovalRequestRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    sourceRunId: row.sourceRunId !== null && row.sourceRunId !== undefined ? Number(row.sourceRunId) : null,
    sourceResultRank: Number(row.sourceResultRank || 1),
    appliedVersion: row.appliedVersion !== null && row.appliedVersion !== undefined ? Number(row.appliedVersion) : null,
    appliedPromotionId: row.appliedPromotionId !== null && row.appliedPromotionId !== undefined ? Number(row.appliedPromotionId) : null,
  };
}

function computeChangedPaths(currentConfig = {}, nextConfig = {}, prefix = '', acc = []) {
  const keys = new Set([
    ...Object.keys(currentConfig || {}),
    ...Object.keys(nextConfig || {}),
  ]);

  keys.forEach((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const currentValue = currentConfig ? currentConfig[key] : undefined;
    const nextValue = nextConfig ? nextConfig[key] : undefined;

    const currentIsObject = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue);
    const nextIsObject = nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue);

    if (currentIsObject || nextIsObject) {
      computeChangedPaths(currentValue || {}, nextValue || {}, path, acc);
      return;
    }

    if (JSON.stringify(currentValue) !== JSON.stringify(nextValue)) {
      acc.push({ path, from: currentValue, to: nextValue });
    }
  });

  return acc;
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

async function listPromotionRequests({ limit = 20, status = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const values = [safeLimit];
  let whereClause = '';

  if (status) {
    values.push(String(status));
    whereClause = 'WHERE status = $2';
  }

  const result = await pool.query(
    `
      SELECT
        id,
        request_type AS "requestType",
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        requested_by AS "requestedBy",
        approved_by AS "approvedBy",
        rejected_by AS "rejectedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        simulation,
        approval_note AS "approvalNote",
        rejection_note AS "rejectionNote",
        applied_promotion_id AS "appliedPromotionId",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        approved_at AS "approvedAt",
        rejected_at AS "rejectedAt"
      FROM promotion_approval_requests
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    values,
  );

  return result.rows.map(normalizeApprovalRequestRow);
}

async function getPromotionRequestById(requestId) {
  const safeId = Number(requestId);
  if (!Number.isFinite(safeId) || safeId <= 0) return null;

  const result = await pool.query(
    `
      SELECT
        id,
        request_type AS "requestType",
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        requested_by AS "requestedBy",
        approved_by AS "approvedBy",
        rejected_by AS "rejectedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        simulation,
        approval_note AS "approvalNote",
        rejection_note AS "rejectionNote",
        applied_promotion_id AS "appliedPromotionId",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        approved_at AS "approvedAt",
        rejected_at AS "rejectedAt"
      FROM promotion_approval_requests
      WHERE id = $1
      LIMIT 1
    `,
    [safeId],
  );

  return normalizeApprovalRequestRow(result.rows[0] || null);
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, NOW(), CASE WHEN $5 IN ('applied', 'rollback_applied') THEN NOW() ELSE NULL END)
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

async function createApprovalRequestRecord({
  requestType = 'optimizer_winner',
  sourceType,
  sourceRunId = null,
  sourceResultRank = 1,
  targetChannel,
  status = 'pending',
  requestedBy = 'dashboard',
  reason = null,
  summary = {},
  configOverride = {},
  promotedConfig = {},
  simulation = {},
}) {
  const result = await pool.query(
    `
      INSERT INTO promotion_approval_requests (
        request_type,
        source_type,
        source_run_id,
        source_result_rank,
        target_channel,
        status,
        requested_by,
        reason,
        summary,
        config_override,
        promoted_config,
        simulation,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, NOW(), NOW())
      RETURNING
        id,
        request_type AS "requestType",
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        requested_by AS "requestedBy",
        approved_by AS "approvedBy",
        rejected_by AS "rejectedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        simulation,
        approval_note AS "approvalNote",
        rejection_note AS "rejectionNote",
        applied_promotion_id AS "appliedPromotionId",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        approved_at AS "approvedAt",
        rejected_at AS "rejectedAt"
    `,
    [
      requestType,
      sourceType,
      sourceRunId,
      sourceResultRank,
      targetChannel,
      status,
      requestedBy,
      reason,
      JSON.stringify(summary || {}),
      JSON.stringify(configOverride || {}),
      JSON.stringify(promotedConfig || {}),
      JSON.stringify(simulation || {}),
    ],
  );

  return normalizeApprovalRequestRow(result.rows[0]);
}

async function buildPromotionContext({ optimizationRunId, rank = 1, targetChannel = 'paper_active' }) {
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

  if (String(targetChannel) === 'paper_active') {
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
  }

  if (String(targetChannel) === 'live_candidate') {
    promotedConfig.trading = {
      ...promotedConfig.trading,
      mode: 'live',
    };
    promotedConfig.execution = {
      ...promotedConfig.execution,
      live: {
        ...(promotedConfig.execution?.live || {}),
        enabled: false,
        dryRun: true,
      },
    };
  }

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

  const changedPaths = computeChangedPaths(activeConfig, promotedConfig);
  const warnings = [];
  if ((changedPaths || []).some((item) => item.path.startsWith('trading.mode'))) {
    warnings.push('trading_mode_changed');
  }
  if ((changedPaths || []).some((item) => item.path.startsWith('execution.live'))) {
    warnings.push('live_execution_settings_changed');
  }
  if (Number(promotedConfig.risk?.dailyMaxLossPct || 0) > Number(activeConfig.risk?.dailyMaxLossPct || 0)) {
    warnings.push('daily_loss_limit_relaxed');
  }
  if (Number(promotedConfig.ai?.minConfidenceToBuy || 0) < Number(activeConfig.ai?.minConfidenceToBuy || 0)) {
    warnings.push('buy_confidence_reduced');
  }

  return {
    optimizationRun,
    winner,
    activeConfigRow,
    activeConfig,
    promotedConfig,
    summary,
    simulation: {
      currentVersion: Number(activeConfigRow?.version || 0),
      targetChannel: String(targetChannel || 'paper_active'),
      changedPaths: changedPaths.slice(0, 40),
      warnings,
      guardrailPreview: {
        tradingEnabled: Boolean(promotedConfig.trading?.enabled),
        mode: promotedConfig.trading?.mode || 'paper',
        symbolsCount: Array.isArray(promotedConfig.trading?.symbols) ? promotedConfig.trading.symbols.length : 0,
        maxOpenPositions: Number(promotedConfig.trading?.maxOpenPositions || 0),
        dailyMaxLossPct: Number(promotedConfig.risk?.dailyMaxLossPct || 0),
        socialExtremeRiskThreshold: Number(promotedConfig.ai?.socialExtremeRiskThreshold || 0),
      },
    },
  };
}

async function simulateOptimizationWinnerPromotion({ optimizationRunId, rank = 1, targetChannel = 'paper_active' }) {
  const context = await buildPromotionContext({ optimizationRunId, rank, targetChannel });

  return {
    currentVersion: Number(context.activeConfigRow?.version || 0),
    targetChannel: String(targetChannel || 'paper_active'),
    summary: context.summary,
    winner: context.winner,
    simulation: context.simulation,
  };
}

async function createApprovalRequestFromOptimizer({
  optimizationRunId,
  rank = 1,
  targetChannel = 'paper_active',
  requestedBy = 'dashboard',
  reason = null,
}) {
  const context = await buildPromotionContext({ optimizationRunId, rank, targetChannel });

  const request = await createApprovalRequestRecord({
    requestType: 'optimizer_winner',
    sourceType: 'optimizer',
    sourceRunId: Number(context.optimizationRun.id),
    sourceResultRank: Number(context.winner.rank || rank || 1),
    targetChannel: String(targetChannel || 'paper_active'),
    requestedBy,
    reason,
    summary: context.summary,
    configOverride: context.winner.configOverride || {},
    promotedConfig: context.promotedConfig,
    simulation: context.simulation,
  });

  return {
    request,
    winner: context.winner,
    simulation: context.simulation,
  };
}

async function approvePromotionRequest({ requestId, approvedBy = 'reviewer', approvalNote = null }) {
  const request = await getPromotionRequestById(requestId);
  if (!request) {
    throw new Error('promotion_request_not_found');
  }

  if (request.status !== 'pending') {
    throw new Error('promotion_request_not_pending');
  }

  if (String(request.requestedBy || '').trim() && String(request.requestedBy || '').trim() === String(approvedBy || '').trim()) {
    throw new Error('promotion_self_approval_not_allowed');
  }

  let updatedConfig = null;
  let promotionStatus = 'staged_live_candidate';
  let appliedVersion = null;

  if (String(request.targetChannel || 'paper_active') === 'paper_active') {
    updatedConfig = await updateActiveConfig(request.promotedConfig || {}, {
      actionType: 'promotion_apply_approved_request',
      actor: approvedBy,
      sourceType: request.sourceType || 'approval_request',
      sourceId: Number(request.sourceRunId || request.id),
      reason: approvalNote || request.reason || `request:${request.id}`,
      metadata: {
        requestId: Number(request.id),
        summary: request.summary || {},
      },
    });
    promotionStatus = 'applied';
    appliedVersion = Number(updatedConfig.version || 0);
  }

  const promotion = await createPromotionRecord({
    sourceType: request.sourceType || 'optimizer',
    sourceRunId: request.sourceRunId,
    sourceResultRank: request.sourceResultRank,
    targetChannel: request.targetChannel,
    status: promotionStatus,
    approvedBy,
    reason: approvalNote || request.reason,
    summary: request.summary || {},
    configOverride: request.configOverride || {},
    promotedConfig: request.promotedConfig || {},
    appliedVersion,
  });

  const updatedRequestResult = await pool.query(
    `
      UPDATE promotion_approval_requests
      SET status = $2,
          approved_by = $3,
          approval_note = $4,
          applied_promotion_id = $5,
          applied_version = $6,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        request_type AS "requestType",
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        requested_by AS "requestedBy",
        approved_by AS "approvedBy",
        rejected_by AS "rejectedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        simulation,
        approval_note AS "approvalNote",
        rejection_note AS "rejectionNote",
        applied_promotion_id AS "appliedPromotionId",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        approved_at AS "approvedAt",
        rejected_at AS "rejectedAt"
    `,
    [
      Number(request.id),
      promotionStatus === 'applied' ? 'approved_applied' : 'approved_staged',
      approvedBy,
      approvalNote,
      Number(promotion.id),
      appliedVersion,
    ],
  );

  return {
    request: normalizeApprovalRequestRow(updatedRequestResult.rows[0] || null),
    promotion,
    updatedConfig,
  };
}

async function rejectPromotionRequest({ requestId, rejectedBy = 'reviewer', rejectionNote = null }) {
  const request = await getPromotionRequestById(requestId);
  if (!request) {
    throw new Error('promotion_request_not_found');
  }

  if (request.status !== 'pending') {
    throw new Error('promotion_request_not_pending');
  }

  const result = await pool.query(
    `
      UPDATE promotion_approval_requests
      SET status = 'rejected',
          rejected_by = $2,
          rejection_note = $3,
          rejected_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        request_type AS "requestType",
        source_type AS "sourceType",
        source_run_id AS "sourceRunId",
        source_result_rank AS "sourceResultRank",
        target_channel AS "targetChannel",
        status,
        requested_by AS "requestedBy",
        approved_by AS "approvedBy",
        rejected_by AS "rejectedBy",
        reason,
        summary,
        config_override AS "configOverride",
        promoted_config AS "promotedConfig",
        simulation,
        approval_note AS "approvalNote",
        rejection_note AS "rejectionNote",
        applied_promotion_id AS "appliedPromotionId",
        applied_version AS "appliedVersion",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        approved_at AS "approvedAt",
        rejected_at AS "rejectedAt"
    `,
    [Number(request.id), rejectedBy, rejectionNote],
  );

  return normalizeApprovalRequestRow(result.rows[0] || null);
}

async function promoteOptimizationWinner({
  optimizationRunId,
  rank = 1,
  targetChannel = 'paper_active',
  approvedBy = 'dashboard',
  reason = null,
}) {
  const directSimulation = await simulateOptimizationWinnerPromotion({ optimizationRunId, rank, targetChannel });

  if (String(targetChannel || 'paper_active') !== 'paper_active') {
    const requestResult = await createApprovalRequestFromOptimizer({
      optimizationRunId,
      rank,
      targetChannel,
      requestedBy: approvedBy,
      reason,
    });

    return {
      promotion: null,
      winner: requestResult.winner,
      updatedConfig: null,
      request: requestResult.request,
      simulation: directSimulation.simulation,
    };
  }

  const requestResult = await createApprovalRequestFromOptimizer({
    optimizationRunId,
    rank,
    targetChannel,
    requestedBy: approvedBy,
    reason,
  });

  return {
    promotion: null,
    winner: requestResult.winner,
    updatedConfig: null,
    request: requestResult.request,
    simulation: directSimulation.simulation,
  };
}

async function rollbackActiveConfigToVersion({ version, requestedBy = 'dashboard', reason = null }) {
  const activeConfigRow = await getActiveConfig();
  const targetVersion = await getConfigVersion(version);

  if (!activeConfigRow) {
    throw new Error('active_config_not_found');
  }

  if (!targetVersion) {
    throw new Error('rollback_version_not_found');
  }

  if (Number(targetVersion.version) === Number(activeConfigRow.version)) {
    throw new Error('rollback_target_is_current_version');
  }

  const updatedConfig = await updateActiveConfig(targetVersion.config, {
    actionType: 'config_rollback_manual',
    actor: requestedBy,
    sourceType: 'config_version',
    sourceId: Number(targetVersion.id),
    reason: reason || `rollback_to_v${targetVersion.version}`,
    metadata: {
      rollbackFromVersion: Number(activeConfigRow.version || 0),
      rollbackToVersion: Number(targetVersion.version || 0),
    },
  });

  const promotion = await createPromotionRecord({
    sourceType: 'rollback',
    sourceRunId: null,
    sourceResultRank: 1,
    targetChannel: 'paper_active',
    status: 'rollback_applied',
    approvedBy: requestedBy,
    reason: reason || `rollback_to_v${targetVersion.version}`,
    summary: {
      rollbackFromVersion: Number(activeConfigRow.version || 0),
      rollbackToVersion: Number(targetVersion.version || 0),
    },
    configOverride: {},
    promotedConfig: targetVersion.config,
    appliedVersion: Number(updatedConfig.version || 0),
  });

  return {
    targetVersion,
    updatedConfig,
    promotion,
  };
}

module.exports = {
  listPromotions,
  listPromotionRequests,
  getPromotionRequestById,
  simulateOptimizationWinnerPromotion,
  createApprovalRequestFromOptimizer,
  approvePromotionRequest,
  rejectPromotionRequest,
  promoteOptimizationWinner,
  rollbackActiveConfigToVersion,
};
