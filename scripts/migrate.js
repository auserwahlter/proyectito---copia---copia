// LUTA E DANÇA — Fase 0
// Ejecuta migraciones.sql contra la base de datos configurada en .env
// Uso:  npm run migrate
// Nota: requiere que PostgreSQL esté levantado y accesible.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'migraciones.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('No se encontró migraciones.sql');
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Conectado. Ejecutando migraciones...');
    await client.query(sql);
    console.log('Migraciones aplicadas correctamente.');
  } catch (err) {
    console.error('Error ejecutando las migraciones:');
    console.error(err.message || err.code || JSON.stringify(err));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();