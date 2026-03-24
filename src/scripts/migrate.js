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
    await client.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
