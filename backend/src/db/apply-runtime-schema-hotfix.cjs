#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function main() {
  const sqlPath = path.join(__dirname, 'runtime-schema-hotfix.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await pool.connect();
  try {
    console.log('[runtime-schema-hotfix] applying SQL from', sqlPath);
    await client.query(sql);
    console.log('[runtime-schema-hotfix] done');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[runtime-schema-hotfix] failed:', error);
  process.exit(1);
});
