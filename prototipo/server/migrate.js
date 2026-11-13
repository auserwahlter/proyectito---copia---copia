import 'dotenv/config'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, waitForDatabase, closePool } from './db.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDirectory = path.join(root, 'db', 'migrations')

export async function runMigrations() {
  await waitForDatabase()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const applied = new Set(
    (await pool.query('SELECT version FROM schema_migrations')).rows.map(
      (row) => row.version,
    ),
  )
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [file],
      )
      await client.query('COMMIT')
      console.log(`Migracion aplicada: ${file}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return files.length
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migraciones al dia.')
    })
    .catch((error) => {
      console.error('Error ejecutando migraciones:', error)
      process.exitCode = 1
    })
    .finally(closePool)
}
