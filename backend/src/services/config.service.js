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

async function updateActiveConfig(nextConfig) {
  const result = await pool.query(
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

  return result.rows[0] || null;
}

module.exports = {
  getActiveConfig,
  updateActiveConfig,
};
