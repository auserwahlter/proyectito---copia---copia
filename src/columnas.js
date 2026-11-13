const pool = require('./db');

let cache = null;

async function mapaColumnas(force = false) {
  if (cache && !force) return cache;
  const { rows } = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );
  cache = new Map();
  for (const r of rows) {
    if (!cache.has(r.table_name)) cache.set(r.table_name, new Map());
    cache.get(r.table_name).set(r.column_name, true);
  }
  return cache;
}

async function tiene(tabla, columna) {
  const m = await mapaColumnas();
  const t = m.get(tabla);
  return !!t && !!t.get(columna);
}

module.exports = { mapaColumnas, tiene };