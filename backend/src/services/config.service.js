const pool = require('../db/pool');
const { DEFAULT_BOT_CONFIG } = require('../db/schema');

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }

  if (typeof base !== 'object' || base === null) {
    return override !== undefined ? override : base;
  }

  const result = { ...base };
  const source = override || {};

  Object.keys(source).forEach((key) => {
    const baseValue = result[key];
    const nextValue = source[key];

    if (
      baseValue
      && nextValue
      && typeof baseValue === 'object'
      && typeof nextValue === 'object'
      && !Array.isArray(baseValue)
      && !Array.isArray(nextValue)
    ) {
      result[key] = deepMerge(baseValue, nextValue);
    } else {
      result[key] = nextValue;
    }
  });

  return result;
}

function normalizeConfig(config = {}) {
  return deepMerge(DEFAULT_BOT_CONFIG, config || {});
}

function normalizeConfigRow(row) {
  if (!row) return null;
  return {
    ...row,
    version: row.version !== undefined && row.version !== null ? Number(row.version) : row.version,
    config: normalizeConfig(row.config || {}),
  };
}

function normalizeAuditRow(row) {
  if (!row) return null;
  return {
    ...row,
    fromVersion: row.fromVersion !== null && row.fromVersion !== undefined ? Number(row.fromVersion) : null,
    toVersion: row.toVersion !== null && row.toVersion !== undefined ? Number(row.toVersion) : null,
    sourceId: row.sourceId !== null && row.sourceId !== undefined ? Number(row.sourceId) : null,
  };
}

async function createConfigAuditEntry(client, {
  actionType,
  actor = 'system',
  sourceType = null,
  sourceId = null,
  fromVersion = null,
  toVersion = null,
  payload = {},
}) {
  await client.query(
    `
      INSERT INTO config_change_audit (
        action_type,
        actor,
        source_type,
        source_id,
        from_version,
        to_version,
        payload,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
    `,
    [
      String(actionType || 'config_update'),
      String(actor || 'system'),
      sourceType,
      sourceId,
      fromVersion,
      toVersion,
      JSON.stringify(payload || {}),
    ],
  );
}

async function getActiveConfig() {
  const result = await pool.query(
    `
      SELECT id, config_key, version, config, updated_at
      FROM bot_configs
      WHERE config_key = 'active'
      LIMIT 1
    `,
  );

  return normalizeConfigRow(result.rows[0] || null);
}

async function getConfigHistory({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const result = await pool.query(
    `
      SELECT id, config_key, version, config, created_at AS "createdAt"
      FROM bot_config_versions
      WHERE config_key = 'active'
      ORDER BY version DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map(normalizeConfigRow);
}

async function getConfigVersion(version) {
  const safeVersion = Number(version);
  if (!Number.isFinite(safeVersion) || safeVersion <= 0) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT id, config_key, version, config, created_at AS "createdAt"
      FROM bot_config_versions
      WHERE config_key = 'active' AND version = $1
      LIMIT 1
    `,
    [safeVersion],
  );

  return normalizeConfigRow(result.rows[0] || null);
}

async function listConfigAudit({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const result = await pool.query(
    `
      SELECT
        id,
        action_type AS "actionType",
        actor,
        source_type AS "sourceType",
        source_id AS "sourceId",
        from_version AS "fromVersion",
        to_version AS "toVersion",
        payload,
        created_at AS "createdAt"
      FROM config_change_audit
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows.map(normalizeAuditRow);
}

async function updateActiveConfig(nextConfig, audit = {}) {
  const client = await pool.connect();
  const normalizedNextConfig = normalizeConfig(nextConfig);

  try {
    await client.query('BEGIN');

    const previousResult = await client.query(
      `
        SELECT id, config_key, version, config
        FROM bot_configs
        WHERE config_key = 'active'
        LIMIT 1
      `,
    );

    const previous = previousResult.rows[0] || null;

    let updated;
    if (!previous) {
      const inserted = await client.query(
        `
          INSERT INTO bot_configs (config_key, version, config, created_at, updated_at)
          VALUES ('active', 1, $1::jsonb, NOW(), NOW())
          RETURNING id, config_key, version, config, updated_at
        `,
        [JSON.stringify(normalizedNextConfig)],
      );
      updated = inserted.rows[0] || null;
    } else {
      const result = await client.query(
        `
          UPDATE bot_configs
          SET config = $1::jsonb,
              version = version + 1,
              updated_at = NOW()
          WHERE config_key = 'active'
          RETURNING id, config_key, version, config, updated_at
        `,
        [JSON.stringify(normalizedNextConfig)],
      );
      updated = result.rows[0] || null;
    }

    if (updated) {
      await client.query(
        `
          INSERT INTO bot_config_versions (config_key, version, config, created_at)
          VALUES ($1, $2, $3::jsonb, NOW())
          ON CONFLICT (config_key, version) DO NOTHING
        `,
        [updated.config_key, updated.version, JSON.stringify(updated.config)],
      );

      await createConfigAuditEntry(client, {
        actionType: audit.actionType || 'config_update',
        actor: audit.actor || 'dashboard',
        sourceType: audit.sourceType || null,
        sourceId: audit.sourceId || null,
        fromVersion: previous ? Number(previous.version) : null,
        toVersion: Number(updated.version || 0),
        payload: {
          reason: audit.reason || null,
          metadata: audit.metadata || {},
        },
      });
    }

    await client.query('COMMIT');
    return normalizeConfigRow(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  deepMerge,
  normalizeConfig,
  getActiveConfig,
  getConfigHistory,
  getConfigVersion,
  listConfigAudit,
  updateActiveConfig,
};
