const express = require('express');
const bcrypt = require('bcryptjs');

const pool = require('./db');
const { firmarToken } = require('./jwt');
const { requireAuth } = require('./acceso');

const router = express.Router();

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const ALLOWED_PAYMENTS = ['tarjeta', 'paypal', 'transferencia'];

async function registrar(req, res, next) {
  try {
    const body = req.body || {};
    const {
      nombre,
      email,
      password,
      rango = null,
      metodo_pago = 'tarjeta',
    } = body;

    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    const emailNormalizado = typeof email === 'string' ? normalizeEmail(email) : '';
    const passwordValida = typeof password === 'string' ? password : '';

    if (!nombreLimpio || !emailNormalizado || !passwordValida) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios',
      });
    }

    if (nombreLimpio.length > 120 || emailNormalizado.length > 180) {
      return res.status(400).json({
        success: false,
        message: 'El nombre debe tener hasta 120 caracteres y el correo hasta 180',
      });
    }

    if (passwordValida.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres',
      });
    }

    if (!ALLOWED_PAYMENTS.includes(metodo_pago)) {
      return res.status(400).json({
        success: false,
        message: 'Método de pago inválido',
      });
    }

    const passwordHash = await bcrypt.hash(passwordValida, 12);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, rango, metodo_pago, estado)
       VALUES ($1, $2, $3, 'miembro', $4, $5, 'activo')
       RETURNING id, nombre, email, rol, rango, metodo_pago, estado,
                 modo_creador, creador_desde, creado_en`,
      [nombreLimpio, emailNormalizado, passwordHash, rango || null, metodo_pago]
    );

    const user = result.rows[0];
    const token = firmarToken(user);

    return res.status(201).json({ success: true, user, token });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Ese correo ya está registrado',
      });
    }
    if (
      ['23502', '23514', '42703'].includes(error.code) &&
      (error.table === 'usuarios' || String(error.message).includes('usuarios'))
    ) {
      console.error('El esquema de usuarios está desactualizado:', error.code);
      return res.status(503).json({
        success: false,
        message: 'La base de datos necesita actualizarse. Ejecuta "npm run migrate" y vuelve a intentarlo.',
      });
    }
    next(error);
  }
}

async function iniciarSesion(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Correo y contraseña son obligatorios',
      });
    }

    const result = await pool.query(
      `SELECT id, nombre, email, password_hash, rol, rango, metodo_pago, estado,
              modo_creador, creador_desde, bio_creador, comision_personalizada, creado_en
         FROM usuarios
        WHERE email = $1`,
      [normalizeEmail(email)]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    const user = result.rows[0];

    if (user.estado === 'suspendido') {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta está suspendida. Contacta a un moderador.',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    delete user.password_hash;

    const token = firmarToken(user);
    return res.json({ success: true, user, token });
  } catch (error) {
    next(error);
  }
}

router.post('/register', registrar);
router.post('/login', iniciarSesion);

router.get('/yo', requireAuth, async (req, res) => {
  res.json({ success: true, user: req.usuario });
});

module.exports = router;
module.exports.registrar = registrar;
module.exports.iniciarSesion = iniciarSesion;