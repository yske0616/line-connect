require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  const migrationFile = path.join(__dirname, '../../migrations/001_initial.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Running database migration...');
  const client = await pool.connect();
  try {
    // マイグレーション管理テーブルを作成（なければ）
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id      SERIAL PRIMARY KEY,
        name    VARCHAR(256) UNIQUE NOT NULL,
        run_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // すでに実行済みならスキップ
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE name = $1',
      ['001_initial']
    );
    if (rows.length > 0) {
      console.log('✅ Migration 001_initial already applied, skipping.');
      return;
    }

    // トランザクションで実行
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO _migrations (name) VALUES ($1)',
      ['001_initial']
    );
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
