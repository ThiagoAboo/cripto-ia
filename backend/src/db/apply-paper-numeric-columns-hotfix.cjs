const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function main() {
  const filePath = path.join(__dirname, 'paper-numeric-columns-hotfix.sql');
  const sql = fs.readFileSync(filePath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('paper-numeric-columns-hotfix: ok');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('paper-numeric-columns-hotfix: failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
