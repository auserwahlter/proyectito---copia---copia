const jwt = require('jsonwebtoken');

const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

function firmarToken(usuario) {
  return jwt.sign({ uid: usuario.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function leerUsuarioAutenticado(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_err) {
    return null;
  }

  if (!payload || !payload.uid) return null;

  const result = await pool.query(
    `SELECT id, nombre, email, rol, rango, metodo_pago, estado,
            modo_creador, creador_desde, bio_creador, datos_cobro,
            comision_personalizada, creado_en
       FROM usuarios
      WHERE id = $1`,
    [payload.uid]
  );

  if (result.rowCount === 0) return null;

  const user = result.rows[0];
  if (user.estado !== 'activo') return null;

  return user;
}

module.exports = { firmarToken, leerUsuarioAutenticado, JWT_SECRET };