const express = require('express');

const pool = require('./db');
const { requireAuth } = require('./acceso');
const { leerUsuarioAutenticado } = require('./jwt');

const router = express.Router();

const TIPOS_TABLA = {
  video: 'prof_videos',
  imagen: 'prof_imagenes',
  instruccional: 'prof_instruccionales',
  diagrama: 'prof_diagramas',
};

async function obtenerContenido(tipo, id) {
  const tabla = TIPOS_TABLA[tipo];
  if (!tabla) return null;
  const { rows } = await pool.query(
    `SELECT id, autor_id, monetizado, precio, tipo_venta FROM ${tabla} WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function obtenerComision(autorId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(
              u.comision_personalizada,
              (SELECT (cp.valor #>> '{}')::numeric
                 FROM config_plataforma cp
                WHERE cp.clave = 'comision_global'),
              0.30
            ) AS comision
       FROM usuarios u
      WHERE u.id = $1`,
    [autorId]
  );
  return rows[0] ? Math.min(Math.max(parseFloat(rows[0].comision) || 0, 0), 1) : 0.3;
}

function simularPago(monto) {
  const ref = `SIM-${String(Math.floor(1000 + Math.random() * 9000))}`;
  return {
    referencia: ref,
    moneda: 'USD',
    estado: 'completada',
    monto: parseFloat(monto.toFixed(2)),
  };
}

async function registrarAcceso(usuarioId, tipo, contenidoId, via, refId) {
  await pool.query(
    `INSERT INTO accesos (usuario_id, contenido_tipo, contenido_id, via, ref_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (usuario_id, contenido_tipo, contenido_id, via, ref_id) DO NOTHING`,
    [usuarioId, tipo, contenidoId, via, refId]
  );
}

async function registrarLedger(autorId, concepto, bruto, comision, refId, refCol) {
  const montoBruto = parseFloat(bruto);
  const montoNeto = montoBruto * (1 - comision);
  const { rows } = await pool.query(
    `INSERT INTO libro_pagos_creador (creador_id, concepto, monto_bruto, comision_efectiva, monto_neto, ${refCol})
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [autorId, concepto, montoBruto, comision, montoNeto, refId]
  );
  return rows[0];
}

async function tieneAcceso(usuario, contenido, tipo) {
  if (!contenido) return false;
  if (!contenido.monetizado || contenido.tipo_venta === 'gratis') return true;
  if (!usuario) return false;
  if (parseInt(usuario.id, 10) === parseInt(contenido.autor_id, 10)) return true;
  if (['moderador', 'admin'].includes(usuario.rol)) return true;

  if (contenido.tipo_venta === 'pago_unico') {
    const { rows } = await pool.query(
      `SELECT 1 FROM compras
        WHERE comprador_id = $1 AND contenido_tipo = $2 AND contenido_id = $3
          AND estado = 'completada'
        LIMIT 1`,
      [usuario.id, tipo, contenido.id]
    );
    return rows.length > 0;
  }

  if (contenido.tipo_venta === 'suscripcion') {
    const { rows } = await pool.query(
      `SELECT 1 FROM suscripciones
        WHERE usuario_id = $1 AND creador_id = $2 AND estado = 'activa'
        LIMIT 1`,
      [usuario.id, contenido.autor_id]
    );
    return rows.length > 0;
  }

  return false;
}

// ── GET /api/monetizacion/planes?creador=ID ──────────────────────────────
router.get('/planes', async (req, res, next) => {
  try {
    const creador = req.query.creador ? parseInt(req.query.creador, 10) : null;
    if (!creador) return res.status(400).json({ success: false, message: 'Falta el parámetro creador' });

    const { rows } = await pool.query(
      `SELECT id, creador_id, nombre, descripcion, precio, periodicidad, moneda, activo, creado_en
         FROM planes_suscripcion
        WHERE creador_id = $1
        ORDER BY creado_en`,
      [creador]
    );

    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/monetizacion/planes ─────────────────────────────────────────
router.post('/planes', requireAuth, async (req, res, next) => {
  try {
    if (!req.usuario.modo_creador) {
      return res.status(403).json({ success: false, message: 'Activa el modo creador antes de crear planes' });
    }

    const { nombre, descripcion = null, precio, periodicidad = 'mensual', moneda = 'USD' } = req.body;

    if (!nombre || !precio || parseFloat(precio) <= 0) {
      return res.status(400).json({ success: false, message: 'Nombre y precio son obligatorios' });
    }
    if (!['mensual', 'anual'].includes(periodicidad)) {
      return res.status(400).json({ success: false, message: 'Periodicidad inválida' });
    }

    const { rows } = await pool.query(
      `INSERT INTO planes_suscripcion (creador_id, nombre, descripcion, precio, periodicidad, moneda)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, creador_id, nombre, descripcion, precio, periodicidad, moneda, activo`,
      [req.usuario.id, nombre, descripcion, parseFloat(precio), periodicidad, moneda]
    );

    res.status(201).json({ success: true, item: rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── PUT /api/monetizacion/planes/:id ──────────────────────────────────────
router.put('/planes/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT creador_id FROM planes_suscripcion WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });

    const creador = parseInt(rows[0].creador_id, 10);
    if (creador !== parseInt(req.usuario.id, 10) && req.usuario.rol !== 'admin') {
      return res.status(403).json({ success: false, message: 'No puedes editar este plan' });
    }

    const sets = [];
    const values = [];
    let idx = 1;
    const body = req.body || {};

    for (const col of ['nombre', 'descripcion', 'periodicidad', 'moneda']) {
      if (body[col] !== undefined) {
        values.push(body[col]);
        sets.push(`${col} = $${idx++}`);
      }
    }
    if (body.precio !== undefined) {
      values.push(parseFloat(body.precio));
      sets.push(`precio = $${idx++}`);
    }
    if (body.activo !== undefined) {
      values.push(body.activo === true || body.activo === 'true');
      sets.push(`activo = $${idx++}`);
    }

    if (!sets.length) return res.status(400).json({ success: false, message: 'Sin cambios' });

    const result = await pool.query(
      `UPDATE planes_suscripcion SET ${sets.join(', ')}, actualizado_en = NOW()
        WHERE id = $${idx} RETURNING *`,
      [...values, id]
    );

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ── DELETE /api/monetizacion/planes/:id (desactivar) ──────────────────────
router.delete('/planes/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT creador_id FROM planes_suscripcion WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'No encontrado' });

    const creador = parseInt(rows[0].creador_id, 10);
    if (creador !== parseInt(req.usuario.id, 10) && req.usuario.rol !== 'admin') {
      return res.status(403).json({ success: false, message: 'No puedes eliminar este plan' });
    }

    await pool.query('UPDATE planes_suscripcion SET activo = FALSE, actualizado_en = NOW() WHERE id = $1', [id]);
    res.json({ success: true, message: 'Plan desactivado' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/monetizacion/suscripciones ──────────────────────────────────
router.post('/suscripciones', requireAuth, async (req, res, next) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ success: false, message: 'Falta el plan' });

    const { rows } = await pool.query(
      'SELECT id, creador_id, nombre, precio FROM planes_suscripcion WHERE id = $1 AND activo = TRUE',
      [plan_id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Plan no disponible' });

    const plan = rows[0];
    if (parseInt(plan.creador_id, 10) === parseInt(req.usuario.id, 10)) {
      return res.status(400).json({ success: false, message: 'No puedes suscribirte a tu propio plan' });
    }

    const comision = await obtenerComision(plan.creador_id);
    const pago = simularPago(parseFloat(plan.precio));

    try {
      const { rows: subRows } = await pool.query(
        `INSERT INTO suscripciones (usuario_id, creador_id, plan_id, estado, desde)
         VALUES ($1, $2, $3, 'activa', NOW())
         RETURNING id, usuario_id, creador_id, plan_id, estado, desde`,
        [req.usuario.id, plan.creador_id, plan.id]
      );

      await registrarLedger(plan.creador_id, 'suscripcion', pago.monto, comision, subRows[0].id, 'suscripcion_id');

      res.status(201).json({ success: true, item: subRows[0], pago });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, message: 'Ya tienes una suscripción activa a este plan' });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// ── POST /api/monetizacion/suscripciones/:id/cancelar ─────────────────────
router.post('/suscripciones/:id/cancelar', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT id FROM suscripciones WHERE id = $1 AND usuario_id = $2 AND estado = $3',
      [id, req.usuario.id, 'activa']
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Suscripción activa no encontrada' });

    await pool.query("UPDATE suscripciones SET estado = 'cancelada', hasta = NOW() WHERE id = $1", [id]);
    res.json({ success: true, message: 'Suscripción cancelada' });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/monetizacion/mis-suscripciones ───────────────────────────────
router.get('/mis-suscripciones', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.creador_id, u.nombre AS creador_nombre, s.plan_id, p.nombre AS plan_nombre,
              p.precio, p.periodicidad, s.estado, s.desde, s.hasta
         FROM suscripciones s
         JOIN usuarios u ON u.id = s.creador_id
         LEFT JOIN planes_suscripcion p ON p.id = s.plan_id
        WHERE s.usuario_id = $1
        ORDER BY s.creado_en DESC`,
      [req.usuario.id]
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/monetizacion/compras ────────────────────────────────────────
router.post('/compras', requireAuth, async (req, res, next) => {
  try {
    const { contenido_tipo, contenido_id } = req.body;
    if (!TIPOS_TABLA[contenido_tipo] || !contenido_id) {
      return res.status(400).json({ success: false, message: 'Contenido inválido' });
    }

    const contenido = await obtenerContenido(contenido_tipo, contenido_id);
    if (!contenido) return res.status(404).json({ success: false, message: 'Contenido no encontrado' });

    if (!contenido.monetizado || contenido.tipo_venta !== 'pago_unico') {
      return res.status(400).json({ success: false, message: 'Este contenido no se compra por unidad' });
    }
    if (parseInt(contenido.autor_id, 10) === parseInt(req.usuario.id, 10)) {
      return res.status(400).json({ success: false, message: 'No puedes comprar tu propio contenido' });
    }

    const prev = await pool.query(
      `SELECT 1 FROM compras
        WHERE comprador_id = $1 AND contenido_tipo = $2 AND contenido_id = $3
          AND estado = 'completada' LIMIT 1`,
      [req.usuario.id, contenido_tipo, contenido_id]
    );
    if (prev.rowCount > 0) {
      return res.status(409).json({ success: false, message: 'Ya compraste este contenido' });
    }

    const comision = await obtenerComision(contenido.autor_id);
    const pago = simularPago(parseFloat(contenido.precio));

    const { rows: compraRows } = await pool.query(
      `INSERT INTO compras (comprador_id, contenido_tipo, contenido_id, monto, moneda, estado, referencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, comprador_id, contenido_tipo, contenido_id, monto, moneda, estado, referencia`,
      [req.usuario.id, contenido_tipo, contenido_id, pago.monto, pago.moneda, pago.estado, pago.referencia]
    );

    await registrarLedger(contenido.autor_id, 'compra', pago.monto, comision, compraRows[0].id, 'compra_id');
    await registrarAcceso(req.usuario.id, contenido_tipo, contenido_id, 'compra', compraRows[0].id);

    res.status(201).json({ success: true, item: compraRows[0], pago });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/monetizacion/mis-compras ─────────────────────────────────────
router.get('/mis-compras', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.contenido_tipo, c.contenido_id, c.monto, c.moneda, c.estado, c.referencia, c.creado_en
         FROM compras c
        WHERE c.comprador_id = $1
        ORDER BY c.creado_en DESC`,
      [req.usuario.id]
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/monetizacion/acceso/:tipo/:id ────────────────────────────────
router.get('/acceso/:tipo/:id', async (req, res, next) => {
  try {
    const { tipo, id } = req.params;
    const contenido = await obtenerContenido(tipo, id);
    if (!contenido) return res.status(404).json({ success: false, message: 'Contenido no encontrado' });

    const usuario = await leerUsuarioAutenticado(req);
    const acceso = await tieneAcceso(usuario, contenido, tipo);

    res.json({
      success: true,
      acceso,
      motivo: acceso
        ? (contenido.monetizado && contenido.tipo_venta !== 'gratis' ? 'pagado' : 'gratis')
        : 'requiere_pago',
      precio: contenido.monetizado ? contenido.precio : 0,
      tipo_venta: contenido.tipo_venta,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/monetizacion/mis-ingresos ────────────────────────────────────
router.get('/mis-ingresos', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, concepto, monto_bruto, comision_efectiva, monto_neto, estado, creado_en
         FROM libro_pagos_creador
        WHERE creador_id = $1
        ORDER BY creado_en DESC`,
      [req.usuario.id]
    );

    const totals = await pool.query(
      `SELECT COALESCE(SUM(monto_bruto), 0) AS bruto,
              COALESCE(SUM(monto_neto), 0)  AS neto,
              COALESCE(AVG(comision_efectiva), 0) AS comision_promedio
         FROM libro_pagos_creador
        WHERE creador_id = $1`,
      [req.usuario.id]
    );

    res.json({
      success: true,
      items: rows,
      totales: {
        bruto: totals.rows[0].bruto,
        neto: totals.rows[0].neto,
        comision_promedio: totals.rows[0].comision_promedio,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.tieneAcceso = tieneAcceso;
module.exports.obtenerContenido = obtenerContenido;