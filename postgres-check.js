import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env, then run npm.cmd run postgres:test.')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined })
try {
  const result = await pool.query('SELECT current_database() AS database, current_user AS user, NOW() AS server_time')
  console.log(`Connected to PostgreSQL database "${result.rows[0].database}" as "${result.rows[0].user}".`)
  console.log(`Server time: ${result.rows[0].server_time}`)
} catch (error) {
  const detail = error.message || error.code || error.cause?.message || 'Unable to reach the PostgreSQL server.'
  console.error(`PostgreSQL connection failed: ${detail}`)
  console.error('Check that PostgreSQL is running, database "daem" exists, and DATABASE_URL has the correct password.')
  process.exitCode = 1
} finally {
  await pool.end()
}