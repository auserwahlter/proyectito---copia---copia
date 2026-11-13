const express = require('express');

const pool = require('./db');
const { requireAuth } = require('./acceso');
const { leerUsuarioAutenticado } = require('./jwt');
const { crearNotificacion } = require('./notificaciones');

const router = express.Router();

// POST /api/social/seguir/:id — seguir / dejar de seguir (toggle)
router.post('/seguir/:id', requireAuth, async (req, res, next) => {
  try {
    const target = parseInt(req.params.id, 10);
    if (target === Number(req.usuario.id)) {
      return res.status(400).json({ success: false, message: 'No puedes seguirte a ti mismo' });
    }

    const { rows } = await pool.query('SELECT 1 FROM usuarios WHERE id = $1', [target]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    const existente = await pool.query(
      'SELECT 1 FROM seguimientos WHERE seguidor_id = $1 AND seguido_id = $2',
      [req.usuario.id, target]
    );

    let following;
    if (existente.rowCount > 0) {
      await pool.query('DELETE FROM seguimientos WHERE seguidor_id = $1 AND seguido_id = $2', [req.usuario.id, target]);
      following = false;
    } else {
      await pool.query(
        'INSERT INTO seguimientos (seguidor_id, seguido_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.usuario.id, target]
      );
      following = true;
      await crearNotificacion({
        usuario_id: target,
        titulo: 'Nuevo seguidor',
        mensaje: `@${req.usuario.nombre} comenzó a seguirte.`,
        tipo: 'social',
        metadata: { seguidor_id: req.usuario.id },
      });
    }

    const followers = await pool.query('SELECT COUNT(*)::int AS n FROM seguimientos WHERE seguido_id = $1', [target]);
    res.json({ success: true, following, seguidores: followers.rows[0].n });
  } catch (error) {
    next(error);
  }
});

// GET /api/social/estado/:id — ¿lo sigo? + contadores (auth opcional)
router.get('/estado/:id', async (req, res, next) => {
  try {
    const target = parseInt(req.params.id, 10);
    const usuario = await leerUsuarioAutenticado(req);

    const [followers, following] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM seguimientos WHERE seguido_id = $1', [target]),
      pool.query('SELECT COUNT(*)::int AS n FROM seguimientos WHERE seguidor_id = $1', [target]),
    ]);

    let is_following = false;
    if (usuario) {
      const q = await pool.query(
        'SELECT 1 FROM seguimientos WHERE seguidor_id = $1 AND seguido_id = $2',
        [usuario.id, target]
      );
      is_following = q.rowCount > 0;
    }

    res.json({
      success: true,
      seguidores: followers.rows[0].n,
      siguiendo: following.rows[0].n,
      is_following,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/social/siguiendo — creadores que sigo
router.get('/siguiendo', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.rol, u.modo_creador, u.bio_creador, s.creado_en AS seguido_desde
         FROM seguimientos s
         JOIN usuarios u ON u.id = s.seguido_id
        WHERE s.seguidor_id = $1
        ORDER BY s.creado_en DESC`,
      [req.usuario.id]
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/social/seguidores/:id — seguidores de un usuario
router.get('/seguidores/:id', async (req, res, next) => {
  try {
    const target = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.rol, s.creado_en
         FROM seguimientos s
         JOIN usuarios u ON u.id = s.seguidor_id
        WHERE s.seguido_id = $1
        ORDER BY s.creado_en DESC`,
      [target]
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;