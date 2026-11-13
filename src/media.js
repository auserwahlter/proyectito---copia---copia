const fs = require('fs');
const path = require('path');
const express = require('express');

const pool = require('./db');
const { generarMiniatura } = require('./thumbs');

const router = express.Router();

const BASE = path.resolve(process.env.UPLOAD_FOLDER || path.join(__dirname, '..', 'uploads'));

console.log('[media] base de archivos:', BASE);
console.log('[media] existente:', fs.existsSync(BASE) ? 'si' : 'NO existe');

const MIME = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

function mimeFromExt(ext) {
  return MIME[ext] || 'application/octet-stream';
}

function relFromUrl(urlPath) {
  let rel = urlPath.replace(/^\/+/, '').replace(/\\/g, '/');
  const m = rel.match(/(?:^|.*?\/)uploads\/(.*)$/i);
  if (m) rel = m[1];
  rel = rel.replace(/^[A-Za-z]:/, '');
  return rel.replace(/\//g, path.sep);
}

function logMedia(req, ok, detalle) {
  console.log(`[media] ${ok ? 'OK' : 'FALLO'} ${req.method} ${req.originalUrl} | ${detalle}`);
}

function absPath(rel) {
  const abs = path.join(BASE, rel);
  if (!abs.startsWith(BASE + path.sep)) return null;
  return abs;
}

function servirConRange(req, res, abs) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (e) {
    console.error(`[media] ERROR statSync en ${abs}: ${e.message}`);
    res.status(500).json({ success: false, message: 'No se puede acceder al archivo' });
    return;
  }
  if (stat.size === 0) {
    console.error(`[media] ERROR archivo VACIO (0 bytes): ${abs}`);
    res.status(500).json({ success: false, message: 'El archivo está vacío (0 bytes). Re-sube el contenido.' });
    return;
  }

  const range = req.headers.range;
  const type = mimeFromExt(path.extname(abs).toLowerCase());
  const size = stat.size;

  const streamError = (e) => {
    console.error(`[media] ERROR leyendo ${abs}: ${e.message}`);
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  };

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!m) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    let start = m[1] ? parseInt(m[1], 10) : NaN;
    let end = m[2] ? parseInt(m[2], 10) : NaN;

    if (Number.isNaN(start)) {
      const suffix = Number.isNaN(end) ? 0 : end;
      const largo = Math.min(suffix, size);
      start = Math.max(size - largo, 0);
      end = size - 1;
    } else {
      if (Number.isNaN(end)) end = size - 1;
    }

    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    end = Math.min(end, size - 1);

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': type,
    });
    const rs = fs.createReadStream(abs, { start, end }).on('error', streamError).pipe(res);
    rs.on('error', streamError);
  } else {
    res.writeHead(200, {
      'Content-Length': size,
      'Accept-Ranges': 'bytes',
      'Content-Type': type,
    });
    const rs = fs.createReadStream(abs).on('error', streamError).pipe(res);
    rs.on('error', streamError);
  }
}

function videosProtegidos() {
  const videosDir = path.join(BASE, 'videos');
  if (!fs.existsSync(videosDir)) return [];
  const out = [];
  const pila = [videosDir];
  while (pila.length) {
    const dir = pila.pop();
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, entrada.name);
      if (entrada.isDirectory()) pila.push(ruta);
      else if (/\.(mp4|webm|mov|m4v)$/i.test(entrada.name)) out.push(ruta);
    }
  }
  return out;
}

function buscarVideoPorBase(base) {
  const objetivo = base.replace(/\.jpg$/i, '');
  for (const video of videosProtegidos()) {
    if (path.basename(video, path.extname(video)).toLowerCase() === objetivo.toLowerCase()) return video;
  }
  return null;
}

router.get('/video/*', (req, res) => {
  const rel = relFromUrl(req.params[0]);
  const abs = absPath(rel);
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    logMedia(req, false, `rel='${rel}' -> abs='${abs}' ${abs && !fs.existsSync(abs) ? 'NO existe en disco' : (fs.existsSync(abs) && !fs.statSync(abs).isFile() ? 'es carpeta' : 'FUERA de la base')}`);
    return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
  }
  logMedia(req, true, `enviando video (${fs.statSync(abs).size} bytes) ${req.headers.range ? 'RANGE=' + req.headers.range : 'sin Range'}`);
  servirConRange(req, res, abs);
});

router.get('/thumbs/:nombre', (req, res, next) => {
  const nombre = path.basename(req.params.nombre).replace(/\.jpg$/i, '') + '.jpg';
  const abs = path.join(BASE, 'thumbs', nombre);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return res.sendFile(abs);

  const video = buscarVideoPorBase(nombre);
  if (!video) {
    logMedia(req, false, `miniatura no encontrada y video base '${nombre}' inexistente en ${path.join(BASE, 'videos')}`);
    return res.status(404).json({ success: false, message: 'Miniatura no disponible' });
  }

  logMedia(req, true, `generando miniatura desde ${video}`);
  generarMiniatura(video)
    .then(thumb => res.sendFile(thumb))
    .catch(e => {
      logMedia(req, false, `ffmpeg fallo al generar miniatura: ${e.message}`);
      res.status(404).json({ success: false, message: 'Miniatura no disponible' });
    });
});

router.get('*', (req, res) => {
  const rel = relFromUrl(req.path);
  const abs = absPath(rel);
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    logMedia(req, false, `rel='${rel}' -> abs='${abs}' ${abs && !fs.existsSync(abs) ? 'NO existe en disco' : 'FUERA de la base'}`);
    return res.status(404).json({ success: false, message: 'No encontrado' });
  }

  const ext = path.extname(abs).toLowerCase();
  if (ext === '.mp4' || ext === '.webm' || ext === '.mov' || ext === '.m4v' || ext === '.mp3' || ext === '.ogg' || ext === '.wav') {
    logMedia(req, true, `sirviendo ${ext} (${fs.statSync(abs).size} bytes) ${req.headers.range ? 'RANGE=' + req.headers.range : 'sin Range'}`);
    return servirConRange(req, res, abs);
  }
  logMedia(req, true, `sirviendo ${ext}`);
  res.sendFile(abs);
});

module.exports = router;