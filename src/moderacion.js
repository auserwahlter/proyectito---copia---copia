const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const pool = require('./db');
const { requireAuth } = require('./acceso');

const router = express.Router();

const esModerador = [
  requireAuth,
  (req, res, next) => {
    if (!['moderador', 'admin'].includes(req.usuario.rol)) {
      return res.status(403).json({ success: false, message: 'No tienes permisos' });
    }
    next();
  },
];

async function umbralVotos() {
  const { rows } = await pool.query(
    `SELECT (valor #>> '{}')::int AS n FROM config_plataforma WHERE clave = 'votos_moderador'`
  );
  return rows[0] ? rows[0].n : 2;
}

// ── POST /api/mod/solicitudes — pedir ser moderador ───────────────────────
router.post('/solicitudes', requireAuth, async (req, res, next) => {
  try {
    if (req.usuario.rol !== 'miembro') {
      return res.status(400).json({ success: false, message: 'Solo los usuarios pueden solicitar moderación' });
    }

    const motivo = (req.body && req.body.motivo) || null;
    const { rows } = await pool.query(
      `SELECT id FROM solicitudes_rol WHERE usuario_id = $1 AND estado = 'pendiente'`,
      [req.usuario.id]
    );

    if (rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya tienes una solicitud pendiente' });
    }

    const result = await pool.query(
      `INSERT INTO solicitudes_rol (usuario_id, tipo, motivo)
       VALUES ($1, 'moderador', $2)
       RETURNING id, usuario_id, tipo, motivo, estado, creado_en`,
      [req.usuario.id, motivo]
    );

    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/mod/solicitudes/mia — mi solicitud ───────────────────────────
router.get('/solicitudes/mia', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, motivo, estado, creado_en, resuelto_en
         FROM solicitudes_rol WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 1`,
      [req.usuario.id]
    );
    res.json({ success: true, item: rows[0] || null });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/mod/solicitudes?estado=pendiente — listar para moderadores ───
router.get('/solicitudes', esModerador, async (req, res, next) => {
  try {
    const estado = req.query.estado || 'pendiente';
    if (!['pendiente', 'aprobada', 'rechazada'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.usuario_id, u.nombre, u.email, s.motivo, s.estado, s.creado_en,
              (SELECT count(*) FROM votos_solicitud v WHERE v.solicitud_id = s.id AND v.decision = 'aprobar')  AS votes_aprueba,
              (SELECT count(*) FROM votos_solicitud v WHERE v.solicitud_id = s.id AND v.decision = 'rechazar') AS votes_rechaza,
              EXISTS (SELECT 1 FROM votos_solicitud v WHERE v.solicitud_id = s.id AND v.moderador_id = $2) AS ya_vote
         FROM solicitudes_rol s
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.estado = $1
        ORDER BY s.creado_en ASC`,
      [estado, req.usuario.id]
    );

    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/mod/solicitudes/:id/voto ───────────────────────────────────
router.post('/solicitudes/:id/voto', esModerador, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, motivo } = req.body || {};

    if (!['aprobar', 'rechazar'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Decisión inválida' });
    }

    const { rows: solicitudes } = await pool.query(
      'SELECT id, usuario_id, estado FROM solicitudes_rol WHERE id = $1',
      [id]
    );
    if (solicitudes.length === 0) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    const solicitud = solicitudes[0];

    if (solicitud.estado !== 'pendiente') {
      return res.status(400).json({ success: false, message: 'La solicitud ya fue resuelta' });
    }
    if (parseInt(solicitud.usuario_id, 10) === parseInt(req.usuario.id, 10)) {
      return res.status(400).json({ success: false, message: 'No puedes votar tu propia solicitud' });
    }

    const { rowCount: yaVoto } = await pool.query(
      'SELECT id FROM votos_solicitud WHERE solicitud_id = $1 AND moderador_id = $2',
      [id, req.usuario.id]
    );
    if (yaVoto > 0) {
      return res.status(409).json({ success: false, message: 'Ya votaste esta solicitud' });
    }

    await pool.query(
      'INSERT INTO votos_solicitud (solicitud_id, moderador_id, decision, motivo) VALUES ($1, $2, $3, $4)',
      [id, req.usuario.id, decision, motivo || null]
    );

    const umbral = await umbralVotos();
    const { rows: conteo } = await pool.query(
      'SELECT decision, count(*) AS n FROM votos_solicitud WHERE solicitud_id = $1 GROUP BY decision',
      [id]
    );
    const mapa = Object.fromEntries(conteo.map(c => [c.decision, parseInt(c.n, 10)]));
    const aprobadas = mapa.aprobar || 0;
    const rechazadas = mapa.rechazar || 0;

    let resuelta = null;
    if (aprobadas >= umbral) {
      resuelta = 'aprobada';
    } else if (rechazadas >= umbral) {
      resuelta = 'rechazada';
    }

    if (resuelta) {
      await pool.query(
        `UPDATE solicitudes_rol SET estado = $1, resuelto_en = NOW() WHERE id = $2`,
        [resuelta, id]
      );
      if (resuelta === 'aprobada') {
        await pool.query('UPDATE usuarios SET rol = $1 WHERE id = $2', ['moderador', solicitud.usuario_id]);
      }
    }

    res.json({
      success: true,
      conteo: { aprobadas, rechazadas, umbral },
      resuelta,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/mod/reportes — reportes de contenido ─────────────────────────
router.get('/reportes', esModerador, async (req, res, next) => {
  try {
    const { estado } = req.query;
    const where = [];
    const values = [];
    if (estado) { where.push(`r.estado = $${values.length + 1}`); values.push(estado); }
    values.push(parseInt(req.query.limit, 10) || 50);
    const cond = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT r.id, r.tipo AS contenido_tipo, r.contenido_id, r.motivo, r.estado, r.creado_en,
              COALESCE(u.nombre, 'Cuenta eliminada') AS reportado_por,
              COALESCE(v.titulo, i.titulo, ins.titulo, d.titulo) AS titulo
         FROM contenido_reportes r
         LEFT JOIN usuarios u ON u.id = r.usuario_id
         LEFT JOIN prof_videos v ON r.tipo='video' AND v.id=r.contenido_id
         LEFT JOIN prof_imagenes i ON r.tipo='imagen' AND i.id=r.contenido_id
         LEFT JOIN prof_instruccionales ins ON r.tipo='instruccional' AND ins.id=r.contenido_id
         LEFT JOIN prof_diagramas d ON r.tipo='diagrama' AND d.id=r.contenido_id
        ${cond}
        ORDER BY r.creado_en DESC
        LIMIT $${values.length}`,
      values
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/mod/comentarios — comentarios para moderación ───────────────
router.get('/comentarios', esModerador, async (req, res, next) => {
  try {
    const tipo = req.query.tipo;
    const values = [];
    const where = [];
    if (tipo) {
      if (!['video', 'imagen', 'instruccional', 'diagrama'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de contenido no válido' });
      }
      values.push(tipo);
      where.push(`c.tipo = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    values.push(limit);
    const { rows } = await pool.query(
      `SELECT c.id, c.tipo, c.contenido_id, c.parent_id, c.mensaje, c.creado_en,
              c.usuario_id, u.nombre AS autor_nombre,
              COALESCE(v.titulo, i.titulo, ins.titulo, d.titulo) AS contenido_titulo
         FROM contenido_comentarios c
         JOIN usuarios u ON u.id = c.usuario_id
         LEFT JOIN prof_videos v ON c.tipo = 'video' AND v.id = c.contenido_id
         LEFT JOIN prof_imagenes i ON c.tipo = 'imagen' AND i.id = c.contenido_id
         LEFT JOIN prof_instruccionales ins ON c.tipo = 'instruccional' AND ins.id = c.contenido_id
         LEFT JOIN prof_diagramas d ON c.tipo = 'diagrama' AND d.id = c.contenido_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.creado_en DESC
        LIMIT $${values.length}`,
      values
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

router.delete('/comentarios/:id', esModerador, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM contenido_comentarios WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    }
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

// ── PUT /api/mod/reportes/:id/estado — revisado / descartado ──────────────
router.put('/reportes/:id/estado', esModerador, async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!['revisado', 'descartado'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado no válido' });
    }
    const result = await pool.query(
      'UPDATE contenido_reportes SET estado = $1 WHERE id = $2 RETURNING id, estado',
      [estado, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── Comisiones ────────────────────────────────────────────────────────────
// GET /api/mod/usuarios?q=texto — buscar usuarios (para asignar comisión)
router.get('/usuarios', esModerador, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || (q ? 50 : 200), 1), 200);
    const offset = (page - 1) * limit;
    const where = q ? 'WHERE nombre ILIKE $1 OR email ILIKE $1' : '';
    const values = q ? [`%${q}%`, limit, offset] : [limit, offset];
    const limitParam = q ? '$2' : '$1';
    const offsetParam = q ? '$3' : '$2';
    const [users, count] = await Promise.all([
      pool.query(
        `SELECT id, nombre, email, rol, estado, rango, modo_creador,
                comision_personalizada, creado_en
           FROM usuarios ${where}
          ORDER BY creado_en DESC
          LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM usuarios ${where}`,
        q ? [values[0]] : []
      ),
    ]);
    const total = count.rows[0].total;
    res.json({
      success: true,
      items: users.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/usuarios', esModerador, async (req, res, next) => {
  try {
    const { nombre, email, password, estado = 'activo', rango = null } = req.body || {};
    if (!nombre || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, correo y contraseña son obligatorios' });
    }
    if (!String(nombre).trim() || String(nombre).trim().length > 120) {
      return res.status(400).json({ success: false, message: 'El nombre debe tener entre 1 y 120 caracteres' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!['activo', 'pendiente', 'suspendido'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado de usuario no válido' });
    }
    const correo = String(email).trim().toLowerCase();
    if (correo.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ success: false, message: 'Correo electrónico no válido' });
    }
    if (rango && String(rango).length > 40) {
      return res.status(400).json({ success: false, message: 'El rango no puede superar 40 caracteres' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, estado, rango)
       VALUES ($1, $2, $3, 'miembro', $4, $5)
       RETURNING id, nombre, email, rol, estado, rango, modo_creador, creado_en`,
      [String(nombre).trim(), correo, passwordHash, estado, rango || null]
    );
    res.status(201).json({ success: true, item: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado' });
    }
    next(error);
  }
});

router.put('/usuarios/:id', esModerador, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: 'ID de usuario no válido' });
    }

    const existing = await pool.query('SELECT id, rol FROM usuarios WHERE id = $1', [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (existing.rows[0].rol === 'admin') {
      return res.status(403).json({ success: false, message: 'No se puede modificar una cuenta administradora' });
    }
    const body = req.body || {};
    if (Number(req.usuario.id) === id &&
        ((body.estado && body.estado !== 'activo') || body.rol !== undefined)) {
      return res.status(400).json({ success: false, message: 'No puedes desactivar ni cambiar el rol de tu propia cuenta' });
    }

    const fields = [];
    const values = [];
    const add = (column, value) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (body.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre || nombre.length > 120) {
        return res.status(400).json({ success: false, message: 'El nombre debe tener entre 1 y 120 caracteres' });
      }
      add('nombre', nombre);
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Correo electrónico no válido' });
      }
      add('email', email);
    }
    if (body.estado !== undefined) {
      if (!['activo', 'pendiente', 'suspendido'].includes(body.estado)) {
        return res.status(400).json({ success: false, message: 'Estado de usuario no válido' });
      }
      add('estado', body.estado);
    }
    if (body.rango !== undefined) {
      if (body.rango && String(body.rango).length > 40) {
        return res.status(400).json({ success: false, message: 'El rango no puede superar 40 caracteres' });
      }
      add('rango', body.rango || null);
    }
    if (body.rol !== undefined) {
      if (body.rol !== 'miembro' || existing.rows[0].rol !== 'moderador') {
        return res.status(400).json({ success: false, message: 'Los roles solo se cambian mediante la clave de autorización' });
      }
      add('rol', 'miembro');
    }
    if (body.password !== undefined && body.password !== '') {
      if (String(body.password).length < 6) {
        return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' });
      }
      add('password_hash', await bcrypt.hash(body.password, 12));
    }
    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No hay cambios para guardar' });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${fields.join(', ')}, actualizado_en = NOW()
        WHERE id = $${values.length}
        RETURNING id, nombre, email, rol, estado, rango, modo_creador, creado_en`,
      values
    );
    res.json({ success: true, item: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado' });
    }
    next(error);
  }
});

router.delete('/usuarios/:id', esModerador, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: 'ID de usuario no válido' });
    }
    if (Number(req.usuario.id) === id) {
      return res.status(400).json({ success: false, message: 'No puedes eliminar tu propia cuenta' });
    }
    const { rows } = await pool.query(
      `DELETE FROM usuarios WHERE id = $1 AND rol <> 'admin'
       RETURNING id`,
      [id]
    );
    if (!rows.length) {
      const exists = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
      return res.status(exists.rowCount ? 403 : 404).json({
        success: false,
        message: exists.rowCount ? 'No se puede eliminar una cuenta administradora' : 'Usuario no encontrado',
      });
    }
    res.json({ success: true, id: rows[0].id });
  } catch (error) {
    next(error);
  }
});

router.get('/estadisticas/diagramas', esModerador, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.autor_id, d.titulo, d.tipo, d.nodos, d.publicado, d.vistas,
              d.creado_en, u.nombre AS profesor_nombre,
              COALESCE(l.likes, 0)::int AS likes,
              COALESCE(c.comentarios, 0)::int AS comentarios_count
         FROM prof_diagramas d
         JOIN usuarios u ON u.id = d.autor_id
         LEFT JOIN (
           SELECT contenido_id, COUNT(*) AS likes
             FROM contenido_likes
            WHERE tipo = 'diagrama'
            GROUP BY contenido_id
         ) l ON l.contenido_id = d.id
         LEFT JOIN (
           SELECT contenido_id, COUNT(*) AS comentarios
             FROM contenido_comentarios
            WHERE tipo = 'diagrama'
            GROUP BY contenido_id
         ) c ON c.contenido_id = d.id
        ORDER BY d.creado_en DESC`
    );
    res.json({ success: true, estadisticas: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/mod/comision
router.get('/comision', esModerador, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT (valor #>> '{}')::numeric AS valor FROM config_plataforma WHERE clave = 'comision_global'`
    );
    const { rows: overrides } = await pool.query(
      `SELECT id, nombre, email, comision_personalizada FROM usuarios WHERE comision_personalizada IS NOT NULL`
    );

    res.json({
      success: true,
      comision_global: rows[0] ? rows[0].valor : 0.3,
      overrides,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mod/comision/global
router.put('/comision/global', esModerador, async (req, res, next) => {
  try {
    const { comision } = req.body || {};
    const c = parseFloat(comision);
    if (isNaN(c) || c < 0 || c > 1) return res.status(400).json({ success: false, message: 'Comisión inválida (0-1)' });

    await pool.query(
      `INSERT INTO config_plataforma (clave, valor) VALUES ('comision_global', $1)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [JSON.stringify(c)]
    );

    res.json({ success: true, comision_global: c });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mod/comision/usuario/:id
router.put('/comision/usuario/:id', esModerador, async (req, res, next) => {
  try {
    const { comision } = req.body || {};
    const id = parseInt(req.params.id, 10);

    if (comision === null || comision === '') {
      const { rowCount } = await pool.query(
        'UPDATE usuarios SET comision_personalizada = NULL WHERE id = $1', [id]
      );
      if (rowCount === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return res.json({ success: true, comision_personalizada: null });
    }

    const c = parseFloat(comision);
    if (isNaN(c) || c < 0 || c > 1) return res.status(400).json({ success: false, message: 'Comisión inválida (0-1)' });

    const { rowCount } = await pool.query(
      'UPDATE usuarios SET comision_personalizada = $1 WHERE id = $2',
      [c, id]
    );
    if (rowCount === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    res.json({ success: true, comision_personalizada: c });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/mod/promover-moderador — promoverse a moderador con código ────
router.post('/promover-moderador', requireAuth, async (req, res, next) => {
  try {
    const { codigo, usuario_id } = req.body || {};

    if (!codigo) {
      return res.status(400).json({
        success: false,
        message: 'Ingresa el código de autorización',
      });
    }
    if (String(codigo).length > 512) {
      return res.status(400).json({ success: false, message: 'La clave de autorización es demasiado larga' });
    }

    const codigoSecreto = process.env.MOD_SECRET_CODE;
    if (!codigoSecreto || Buffer.byteLength(codigoSecreto.trim(), 'utf8') < 32) {
      return res.status(503).json({
        success: false,
        message: 'La promoción está deshabilitada: configura MOD_SECRET_CODE con al menos 32 caracteres',
      });
    }

    const providedCode = Buffer.from(String(codigo).trim());
    const expectedCode = Buffer.from(codigoSecreto.trim());
    if (providedCode.length !== expectedCode.length || !crypto.timingSafeEqual(providedCode, expectedCode)) {
      return res.status(403).json({
        success: false,
        message: 'Código de autorización incorrecto',
      });
    }

    const usuarioId = usuario_id === undefined ? req.usuario.id : Number(usuario_id);
    if (!Number.isSafeInteger(Number(usuarioId)) || Number(usuarioId) < 1) {
      return res.status(400).json({ success: false, message: 'ID de usuario no válido' });
    }

    const { rows } = await pool.query(
      `UPDATE usuarios
          SET rol = 'moderador',
              estado = 'activo',
              actualizado_en = NOW()
        WHERE id = $1 AND rol <> 'admin'
        RETURNING id, nombre, email, rol, rango, metodo_pago, estado,
                  modo_creador, creador_desde, bio_creador, comision_personalizada, creado_en`,
      [usuarioId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado o no se puede promover',
      });
    }

    res.json({
      success: true,
      message: 'Cuenta promovida a moderador correctamente',
      user: rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;