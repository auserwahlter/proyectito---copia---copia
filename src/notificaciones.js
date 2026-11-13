const express = require('express');

const pool = require('./db');
const { requireAuth } = require('./acceso');

const router = express.Router();

async function crearNotificacion({ usuario_id, titulo, mensaje, tipo = 'info', prioridad = 'normal', metadata = {} }) {
  if (!usuario_id) return;
  try {
    await pool.query(
      `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, prioridad, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [usuario_id, titulo, mensaje, tipo, prioridad, JSON.stringify(metadata)]
    );
  } catch (_e) {
    // Nunca romper el flujo principal por una notificación fallida.
  }
}

// GET /api/notificaciones — notificaciones del usuario autenticado
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, titulo, mensaje, tipo, prioridad, metadata, leida, creado_en
         FROM notificaciones
        WHERE usuario_id = $1
        ORDER BY creado_en DESC
        LIMIT 50`,
      [req.usuario.id]
    );

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM notificaciones WHERE usuario_id = $1 AND leida = FALSE',
      [req.usuario.id]
    );

    res.json({ success: true, items: rows, no_leidas: countRows[0].total });
  } catch (error) {
    next(error);
  }
});

// POST /api/notificaciones/leer-todas
router.post('/leer-todas', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE notificaciones SET leida = TRUE WHERE usuario_id = $1', [req.usuario.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/notificaciones/:id/leida
router.post('/:id/leida', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [id, req.usuario.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Notificación no encontrada' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.crearNotificacion = crearNotificacion;