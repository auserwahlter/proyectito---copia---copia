import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://matctrl:matctrl@localhost:5432/matctrl',
  max: 10,
})

pool.on('error', (error) => {
  console.error('PostgreSQL pool error:', error.message)
})

export function query(text, params) {
  return pool.query(text, params)
}

export async function withTransaction(callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function waitForDatabase(retries = 20, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      if (attempt === retries) throw error
      console.warn(
        `PostgreSQL no disponible (intento ${attempt}/${retries}). Reintentando en ${delay}ms...`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export async function closePool() {
  await pool.end()
}
