const express = require('express');

const pool = require('./db');
const { requireAuth } = require('./acceso');

const router = express.Router();

// PUT /api/auth/perfil — actualizar perfil propio
router.put('/perfil', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const sets = [];
    const values = [];
    let idx = 1;

    for (const col of ['nombre', 'metodo_pago']) {
      if (body[col] !== undefined) {
        values.push(body[col]);
        sets.push(`${col} = $${idx++}`);
      }
    }
    if (body.datos_cobro !== undefined) {
      values.push(JSON.stringify(body.datos_cobro));
      sets.push(`datos_cobro = $${idx++}`);
    }

    if (!sets.length) return res.status(400).json({ success: false, message: 'Sin cambios' });

    const result = await pool.query(
      `UPDATE usuarios SET ${sets.join(', ')}, actualizado_en = NOW()
        WHERE id = $${idx}
        RETURNING id, nombre, email, rol, rango, metodo_pago, estado,
                  modo_creador, creador_desde, bio_creador, comision_personalizada, creado_en`,
      [...values, req.usuario.id]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/modo-creador — activar modo creador
router.post('/modo-creador', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios
          SET actualizado_en = NOW()
        WHERE id = $1
        RETURNING id, nombre, email, rol`,
      [req.usuario.id]
    );

    res.json({ success: true, user: rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/yo/body-tracking — contrato de API (placeholder, próximamente)
router.get('/body-tracking', requireAuth, (_req, res) => {
  res.json({
    success: true,
    data: null,
    mensaje: 'Los registros de progreso corporal llegarán próximamente',
  });
});

module.exports = router;