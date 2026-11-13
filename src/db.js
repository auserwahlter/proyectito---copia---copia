require('dotenv').config();

const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:1234@localhost:5432/luta_danca';

const pool = new Pool({ connectionString, max: 10 });

pool.on('error', (err) => {
  console.error('Error inesperado en un cliente PostgreSQL', err);
});

module.exports = pool;