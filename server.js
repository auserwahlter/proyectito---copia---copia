require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/luta_danca';

const pool = new Pool({
  connectionString,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
});

const normalizeEmail = (email = '') => email.trim().toLowerCase();

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({
      ok: true,
      time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'No se pudo conectar con la base de datos',
    });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const {
      nombre,
      email,
      password,
      rol,
      rango,
      metodo_pago = 'tarjeta',
    } = req.body;

    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios',
      });
    }

    const allowedRoles = ['alumno', 'profesor'];
    const allowedPayments = ['tarjeta', 'paypal', 'transferencia'];

    if (!allowedRoles.includes(rol)) {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido',
      });
    }

    if (!allowedPayments.includes(metodo_pago)) {
      return res.status(400).json({
        success: false,
        message: 'Método de pago inválido',
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, 12);
    const estado = rol === 'profesor' ? 'pendiente' : 'activo';
    const rangoFinal = rol === 'alumno' ? rango || null : null;

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, rango, metodo_pago, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nombre, email, rol, rango, metodo_pago, estado, creado_en`,
      [nombre.trim(), normalizedEmail, passwordHash, rol, rangoFinal, metodo_pago, estado]
    );

    return res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Ese correo ya está registrado',
      });
    }

    console.error('Error en /api/register', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Correo y contraseña son obligatorios',
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const result = await pool.query(
      `SELECT id, nombre, email, password_hash, rol, rango, metodo_pago, estado, creado_en
       FROM usuarios
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    delete user.password_hash;

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error en /api/login', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
