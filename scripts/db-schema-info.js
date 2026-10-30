#!/usr/bin/env node
/**
 * Run from repo root: node scripts/db-schema-info.js
 * Uses .env at repo root for DB connection. Prints table and column names so we can match backend queries.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('=== Tables in public schema ===');
  console.log(tables.rows.map((r) => r.table_name).join('\n'));

  for (const { table_name } of tables.rows) {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table_name]
    );
    console.log('\n=== ' + table_name + ' columns ===');
    console.log(cols.rows.map((r) => r.column_name).join(', '));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
