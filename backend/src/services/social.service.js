const pool = require('../db/pool');

function normalizeScoreRow(row) {
  return {
    ...row,
    socialScore: Number(row.socialScore),
    socialRisk: Number(row.socialRisk),
    sentiment: Number(row.sentiment),
    momentum: Number(row.momentum),
    spamRisk: Number(row.spamRisk),
    sourceCount: Number(row.sourceCount),
  };
}

async function upsertSocialScores(items = []) {
  const saved = [];

  for (const item of items) {
    const symbol = String(item.symbol || '').toUpperCase();
    if (!symbol) continue;

    const result = await pool.query(
      `
        INSERT INTO social_asset_scores (
          symbol,
          social_score,
          social_risk,
          classification,
          sentiment,
          momentum,
          spam_risk,
          source_count,
          sources,
          notes,
          raw,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, NOW())
        ON CONFLICT (symbol)
        DO UPDATE SET
          social_score = EXCLUDED.social_score,
          social_risk = EXCLUDED.social_risk,
          classification = EXCLUDED.classification,
          sentiment = EXCLUDED.sentiment,
          momentum = EXCLUDED.momentum,
          spam_risk = EXCLUDED.spam_risk,
          source_count = EXCLUDED.source_count,
          sources = EXCLUDED.sources,
          notes = EXCLUDED.notes,
          raw = EXCLUDED.raw,
          updated_at = NOW()
        RETURNING
          symbol,
          social_score AS "socialScore",
          social_risk AS "socialRisk",
          classification,
          sentiment,
          momentum,
          spam_risk AS "spamRisk",
          source_count AS "sourceCount",
          sources,
          notes,
          raw,
          updated_at AS "updatedAt"
      `,
      [
        symbol,
        Number(item.socialScore || 0),
        Number(item.socialRisk || 0),
        String(item.classification || 'NEUTRA').toUpperCase(),
        Number(item.sentiment || 0),
        Number(item.momentum || 0),
        Number(item.spamRisk || 0),
        Number(item.sourceCount || (Array.isArray(item.sources) ? item.sources.length : 0)),
        JSON.stringify(item.sources || []),
        JSON.stringify(item.notes || []),
        JSON.stringify(item.raw || item),
      ],
    );

    saved.push(normalizeScoreRow(result.rows[0]));
  }

  return saved;
}

async function createSocialAlert({ symbol, alertType, severity, action = null, message, payload = {} }) {
  const result = await pool.query(
    `
      INSERT INTO social_alerts (symbol, alert_type, severity, action, message, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING id, symbol, alert_type AS "alertType", severity, action, message, payload, created_at AS "createdAt"
    `,
    [String(symbol || '').toUpperCase(), alertType, severity, action, message, JSON.stringify(payload)],
  );

  return result.rows[0];
}

async function upsertProviderStatus({
  providerKey,
  providerName,
  status,
  mode = 'free',
  lastHttpStatus = null,
  retryAfterAt = null,
  payload = {},
}) {
  const safeProviderKey = String(providerKey || '').trim().toLowerCase();
  if (!safeProviderKey) {
    throw new Error('providerKey_required');
  }

  const safeStatus = String(status || 'unknown').toLowerCase();
  const isSuccess = safeStatus === 'ok';
  const result = await pool.query(
    `
      INSERT INTO social_provider_statuses (
        provider_key,
        provider_name,
        status,
        mode,
        last_success_at,
        last_failure_at,
        last_http_status,
        retry_after_at,
        payload,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        CASE WHEN $3 = 'ok' THEN NOW() ELSE NULL END,
        CASE WHEN $3 <> 'ok' THEN NOW() ELSE NULL END,
        $5,
        $6,
        $7::jsonb,
        NOW()
      )
      ON CONFLICT (provider_key)
      DO UPDATE SET
        provider_name = EXCLUDED.provider_name,
        status = EXCLUDED.status,
        mode = EXCLUDED.mode,
        last_success_at = CASE WHEN EXCLUDED.status = 'ok' THEN NOW() ELSE social_provider_statuses.last_success_at END,
        last_failure_at = CASE WHEN EXCLUDED.status <> 'ok' THEN NOW() ELSE social_provider_statuses.last_failure_at END,
        last_http_status = EXCLUDED.last_http_status,
        retry_after_at = EXCLUDED.retry_after_at,
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING
        provider_key AS "providerKey",
        provider_name AS "providerName",
        status,
        mode,
        last_success_at AS "lastSuccessAt",
        last_failure_at AS "lastFailureAt",
        last_http_status AS "lastHttpStatus",
        retry_after_at AS "retryAfterAt",
        payload,
        updated_at AS "updatedAt"
    `,
    [
      safeProviderKey,
      providerName || safeProviderKey,
      safeStatus,
      mode,
      lastHttpStatus,
      retryAfterAt,
      JSON.stringify({
        ...payload,
        healthy: isSuccess,
      }),
    ],
  );

  return result.rows[0];
}

async function getProviderStatuses({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await pool.query(
    `
      SELECT
        provider_key AS "providerKey",
        provider_name AS "providerName",
        status,
        mode,
        last_success_at AS "lastSuccessAt",
        last_failure_at AS "lastFailureAt",
        last_http_status AS "lastHttpStatus",
        retry_after_at AS "retryAfterAt",
        payload,
        updated_at AS "updatedAt"
      FROM social_provider_statuses
      ORDER BY provider_key ASC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}

async function getSocialScores({ symbols = [], limit = 50, classification = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const filters = [];
  const params = [];

  if (symbols.length) {
    params.push(symbols.map((item) => String(item).toUpperCase()));
    filters.push(`symbol = ANY($${params.length}::text[])`);
  }

  if (classification) {
    params.push(String(classification).toUpperCase());
    filters.push(`classification = $${params.length}`);
  }

  params.push(safeLimit);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await pool.query(
    `
      SELECT
        symbol,
        social_score AS "socialScore",
        social_risk AS "socialRisk",
        classification,
        sentiment,
        momentum,
        spam_risk AS "spamRisk",
        source_count AS "sourceCount",
        sources,
        notes,
        raw,
        updated_at AS "updatedAt"
      FROM social_asset_scores
      ${where}
      ORDER BY social_score DESC, updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map(normalizeScoreRow);
}

async function listSocialAlerts({ limit = 50, severity = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [];
  let where = '';

  if (severity) {
    params.push(String(severity).toLowerCase());
    where = `WHERE LOWER(severity) = $${params.length}`;
  }

  params.push(safeLimit);

  const result = await pool.query(
    `
      SELECT
        id,
        symbol,
        alert_type AS "alertType",
        severity,
        action,
        message,
        payload,
        created_at AS "createdAt"
      FROM social_alerts
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows;
}

async function getSocialSummary() {
  const [scoresResult, alertsResult, providers] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::int AS count,
          MAX(updated_at) AS last_updated_at,
          COUNT(*) FILTER (WHERE classification = 'FORTE')::int AS strong_count,
          COUNT(*) FILTER (WHERE classification = 'PROMISSORA')::int AS promising_count,
          COUNT(*) FILTER (WHERE classification = 'ALTO_RISCO')::int AS high_risk_count
        FROM social_asset_scores
      `,
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS count, MAX(created_at) AS last_alert_at
        FROM social_alerts
      `,
    ),
    getProviderStatuses({ limit: 10 }),
  ]);

  return {
    assetsCount: Number(scoresResult.rows[0]?.count || 0),
    strongCount: Number(scoresResult.rows[0]?.strong_count || 0),
    promisingCount: Number(scoresResult.rows[0]?.promising_count || 0),
    highRiskCount: Number(scoresResult.rows[0]?.high_risk_count || 0),
    lastUpdatedAt: scoresResult.rows[0]?.last_updated_at || null,
    alertsCount: Number(alertsResult.rows[0]?.count || 0),
    lastAlertAt: alertsResult.rows[0]?.last_alert_at || null,
    providers,
    attribution: {
      coingecko: 'Data provided by CoinGecko Demo API when available.',
    },
  };
}

module.exports = {
  upsertSocialScores,
  createSocialAlert,
  upsertProviderStatus,
  getProviderStatuses,
  getSocialScores,
  listSocialAlerts,
  getSocialSummary,
};
