const pool = require('../db/pool');

async function getActiveConfig() {
  const result = await pool.query(
    `
      SELECT id, config_key, version, config, updated_at
      FROM bot_configs
      WHERE config_key = 'active'
      LIMIT 1
    `,
  );

  return result.rows[0] || null;
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

  return result.rows;
}

async function updateActiveConfig(nextConfig) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE bot_configs
        SET config = $1::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE config_key = 'active'
        RETURNING id, config_key, version, config, updated_at
      `,
      [JSON.stringify(nextConfig)],
    );

    const updated = result.rows[0] || null;

    if (updated) {
      await client.query(
        `
          INSERT INTO bot_config_versions (config_key, version, config, created_at)
          VALUES ($1, $2, $3::jsonb, NOW())
          ON CONFLICT (config_key, version) DO NOTHING
        `,
        [updated.config_key, updated.version, JSON.stringify(updated.config)],
      );
    }

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getActiveConfig,
  getConfigHistory,
  updateActiveConfig,
};
