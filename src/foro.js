const express = require('express');

const pool = require('./db');
const { requireAuth } = require('./acceso');
const { leerUsuarioAutenticado } = require('./jwt');
const { uploadImage } = require('./upload');
const { crearNotificacion } = require('./notificaciones');

const router = express.Router();

function extraerHashtags(texto) {
  if (!texto) return [];
  const match = texto.match(/#[A-Za-z0-9áéíóúñüÁÉÍÓÚÑÜ_]+/g) || [];
  return match.map(t => t.slice(1).toLowerCase());
}

function clampLimit(val, def = 20, max = 50) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return def;
  return Math.min(n, max);
}

function esModerador(user) {
  return user && ['moderador', 'admin'].includes(user.rol);
}

// GET /api/foro — listar publicaciones (auth opcional para el campo "liked")
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = clampLimit(req.query.limit);
    const offset = (page - 1) * limit;
    const hashtag = (req.query.hashtag || '').trim().toLowerCase().replace(/^#/, '');
    const usuario = await leerUsuarioAutenticado(req);

    const params = [];
    let filtro = '';
    if (hashtag) {
      filtro = 'WHERE $1 = ANY(fp.hashtags)';
      params.push(hashtag);
    }

    params.push(limit, offset);
    const { rows: posts } = await pool.query(
      `SELECT fp.id, fp.usuario_id, u.nombre AS autor_nombre, u.rol AS autor_rol,
              fp.mensaje, fp.hashtags, fp.imagen_url, fp.creado_en
         FROM foro_publicaciones fp
         JOIN usuarios u ON u.id = fp.usuario_id
         ${filtro}
        ORDER BY fp.creado_en DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: pagRows } = hashtag
      ? await pool.query('SELECT COUNT(*)::int AS total FROM foro_publicaciones fp WHERE $1 = ANY(fp.hashtags)', [hashtag])
      : await pool.query('SELECT COUNT(*)::int AS total FROM foro_publicaciones fp');
    const totalPost = pagRows[0].total;

    const items = [];
    for (const p of posts) {
      const likes = await pool.query('SELECT COUNT(*)::int AS n FROM foro_likes WHERE post_id = $1', [p.id]);
      let liked = false;
      if (usuario) {
        const lk = await pool.query('SELECT 1 FROM foro_likes WHERE post_id = $1 AND usuario_id = $2', [p.id, usuario.id]);
        liked = lk.rowCount > 0;
      }
      const replies = await pool.query(
        `SELECT fr.id, fr.usuario_id, u.nombre AS autor_nombre, fr.mensaje, fr.creado_en
           FROM foro_respuestas fr
           JOIN usuarios u ON u.id = fr.usuario_id
          WHERE fr.post_id = $1
          ORDER BY fr.creado_en ASC`,
        [p.id]
      );

      items.push({
        id: p.id,
        usuario_id: p.usuario_id,
        autor_nombre: p.autor_nombre,
        autor_rol: p.autor_rol,
        mensaje: p.mensaje,
        hashtags: p.hashtags || [],
        imagen_url: p.imagen_url,
        creado_en: p.creado_en,
        likes_count: likes.rows[0].n,
        liked,
        respuestas: replies.rows,
        respuestas_count: replies.rowCount,
      });
    }

    res.json({
      success: true,
      items,
      pagination: { page, limit, total: totalPost, pages: Math.ceil(totalPost / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/foro — crear publicación (imagen opcional, campo "image")
router.post('/', requireAuth, uploadImage.single('image'), async (req, res, next) => {
  try {
    const mensaje = (req.body && req.body.mensaje ? req.body.mensaje : '').toString().trim();
    if (!mensaje) {
      return res.status(400).json({ success: false, message: 'La publicación no puede estar vacía' });
    }
    if (mensaje.length > 4000) {
      return res.status(400).json({ success: false, message: 'Máximo 4000 caracteres' });
    }

    let imagen_url = null;
    if (req.file) {
      const filepath = req.file.path.replace(/\\/g, '/').replace(/.*uploads\//, '');
      imagen_url = `/media/${filepath}`;
    }

    const hashtags = extraerHashtags(mensaje);
    const { rows } = await pool.query(
      `INSERT INTO foro_publicaciones (usuario_id, mensaje, hashtags, imagen_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, usuario_id, mensaje, hashtags, imagen_url, creado_en`,
      [req.usuario.id, mensaje, hashtags, imagen_url]
    );

    res.status(201).json({
      success: true,
      item: {
        id: rows[0].id,
        usuario_id: rows[0].usuario_id,
        autor_nombre: req.usuario.nombre,
        autor_rol: req.usuario.rol,
        mensaje: rows[0].mensaje,
        hashtags: rows[0].hashtags,
        imagen_url: rows[0].imagen_url,
        creado_en: rows[0].creado_en,
        likes_count: 0,
        liked: false,
        respuestas: [],
        respuestas_count: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/foro/:id/like
router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT usuario_id FROM foro_publicaciones WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Publicación no encontrada' });

    const dueño = rows[0].usuario_id;
    const existente = await pool.query('SELECT 1 FROM foro_likes WHERE post_id = $1 AND usuario_id = $2', [id, req.usuario.id]);
    let liked;
    if (existente.rowCount > 0) {
      await pool.query('DELETE FROM foro_likes WHERE post_id = $1 AND usuario_id = $2', [id, req.usuario.id]);
      liked = false;
    } else {
      await pool.query('INSERT INTO foro_likes (post_id, usuario_id) VALUES ($1, $2)', [id, req.usuario.id]);
      liked = true;
      if (Number(dueño) !== Number(req.usuario.id)) {
        await crearNotificacion({
          usuario_id: dueño,
          titulo: 'Nuevo like',
          mensaje: `@${req.usuario.nombre} marcó “me gusta” en tu publicación del foro.`,
          tipo: 'forum',
          metadata: { post_id: parseInt(id, 10) },
        });
      }
    }

    const likes = await pool.query('SELECT COUNT(*)::int AS n FROM foro_likes WHERE post_id = $1', [id]);
    res.json({ success: true, liked, likes_count: likes.rows[0].n });
  } catch (error) {
    next(error);
  }
});

// POST /api/foro/:id/respuestas
router.post('/:id/respuestas', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const mensaje = ((req.body || {}).mensaje || '').toString().trim();
    if (!mensaje) return res.status(400).json({ success: false, message: 'La respuesta no puede estar vacía' });
    if (mensaje.length > 2000) return res.status(400).json({ success: false, message: 'Máximo 2000 caracteres' });

    const { rows: postRows } = await pool.query('SELECT usuario_id FROM foro_publicaciones WHERE id = $1', [id]);
    if (postRows.length === 0) return res.status(404).json({ success: false, message: 'Publicación no encontrada' });
    const dueño = postRows[0].usuario_id;

    const { rows } = await pool.query(
      `INSERT INTO foro_respuestas (post_id, usuario_id, mensaje)
       VALUES ($1, $2, $3)
       RETURNING id, post_id, usuario_id, mensaje, creado_en`,
      [id, req.usuario.id, mensaje]
    );

    if (Number(dueño) !== Number(req.usuario.id)) {
      await crearNotificacion({
        usuario_id: dueño,
        titulo: 'Respuesta en el foro',
        mensaje: `@${req.usuario.nombre} respondió tu publicación en el foro.`,
        tipo: 'forum',
        metadata: { post_id: parseInt(id, 10), reply_id: rows[0].id },
      });
    }

    res.status(201).json({
      success: true,
      item: {
        id: rows[0].id,
        post_id: rows[0].post_id,
        usuario_id: rows[0].usuario_id,
        autor_nombre: req.usuario.nombre,
        mensaje: rows[0].mensaje,
        creado_en: rows[0].creado_en,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/foro/:id — autor o moderador
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const mensaje = String((req.body || {}).mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ success: false, message: 'La publicación no puede estar vacía' });
    if (mensaje.length > 4000) return res.status(400).json({ success: false, message: 'Máximo 4000 caracteres' });

    const { rows } = await pool.query(
      'SELECT usuario_id FROM foro_publicaciones WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Publicación no encontrada' });
    if (Number(rows[0].usuario_id) !== Number(req.usuario.id) && !esModerador(req.usuario)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para editar esta publicación' });
    }

    const { rows: updated } = await pool.query(
      `UPDATE foro_publicaciones
          SET mensaje = $1, hashtags = $2, actualizado_en = NOW()
        WHERE id = $3
        RETURNING id, usuario_id, mensaje, hashtags, imagen_url, creado_en`,
      [mensaje, extraerHashtags(mensaje), req.params.id]
    );
    res.json({ success: true, item: updated[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/foro/:id — autor o moderador
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT usuario_id FROM foro_publicaciones WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Publicación no encontrada' });

    const dueño = rows[0].usuario_id;
    if (Number(dueño) !== Number(req.usuario.id) && !esModerador(req.usuario)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para eliminar esta publicación' });
    }

    await pool.query('DELETE FROM foro_publicaciones WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;