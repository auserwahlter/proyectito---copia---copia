require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');

const pool = require('./db');
pool.on('error', (err) => {
  console.error('Error inesperado del pool de PostgreSQL', err);
});
const authRouter = require('./auth');
const perfilRouter = require('./perfil');
const contenidoRouter = require('./contenido');
const feedRouter = require('./feed');
const mediaRouter = require('./media');
const monetizacionRouter = require('./monetizacion');
const moderacionRouter = require('./moderacion');
const foroRouter = require('./foro');
const socialRouter = require('./social');
const notificacionesRouter = require('./notificaciones');

const app = express();
const port = process.env.PORT || 5000;
const matctrlPort =
  process.env.MATCTRL_PROXY_PORT || process.env.MATCTRL_PORT || '3001';

app.use(cors());
app.use('/matctrl', (req, res) => {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: matctrlPort,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${matctrlPort}` },
    },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    console.error('Error conectando con MATCTRL:', error.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'El servicio de torneos y directos no está disponible.',
      });
    } else {
      res.destroy(error);
    }
  });
  req.pipe(upstream);
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const raiz = path.resolve(__dirname, '..');
app.use(express.static(raiz));

app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, matctrlProxy: true, time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'No se pudo conectar con la base de datos' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/auth', perfilRouter);
app.use('/api/yo', perfilRouter);
app.post('/api/register', authRouter.registrar);
app.post('/api/login', authRouter.iniciarSesion);

app.use('/api/feed', feedRouter);
app.use('/api/contenido', contenidoRouter);
app.use('/api/monetizacion', monetizacionRouter);
app.use('/api/mod', moderacionRouter);
app.use('/api/foro', foroRouter);
app.use('/api/social', socialRouter);
app.use('/api/notificaciones', notificacionesRouter);
app.use('/media', mediaRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('Error interno', err);
  res.status(500).json({ success: false, message: err.message || 'Error interno del servidor' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada sin manejar:', reason);
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  if (!requestUrl.pathname.startsWith('/matctrl/ws')) {
    socket.destroy();
    return;
  }

  const upstream = http.request({
    hostname: '127.0.0.1',
    port: matctrlPort,
    method: req.method,
    path: `${requestUrl.pathname.slice('/matctrl'.length)}${requestUrl.search}`,
    headers: { ...req.headers, host: `127.0.0.1:${matctrlPort}` },
  });

  upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}\r\n`,
    );
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      socket.write(
        `${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1]}\r\n`,
      );
    }
    socket.write('\r\n');
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });

  upstream.on('response', (upstreamResponse) => {
    socket.write(
      `HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}\r\n`,
    );
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      socket.write(
        `${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1]}\r\n`,
      );
    }
    socket.write('\r\n');
    upstreamResponse.pipe(socket);
  });

  upstream.on('error', (error) => {
    console.error('Error conectando WebSocket de MATCTRL:', error.message);
    socket.destroy();
  });
  upstream.end();
});

server.listen(port, () => {
  console.log(`Luta e Dança API escuchando en http://localhost:${port}`);
  console.log(`MATCTRL disponible en http://localhost:${port}/matctrl/`);
  const dbUrl = new URL(process.env.DATABASE_URL);
  console.log(`Base de datos: ${dbUrl.hostname}:${dbUrl.port}/${dbUrl.pathname.slice(1)}`);
});