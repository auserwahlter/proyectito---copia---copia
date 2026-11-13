const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let ffmpegPath = null;
try { ffmpegPath = require('ffmpeg-static'); } catch (_e) { ffmpegPath = null; }

console.log('[thumbs] ffmpeg:', ffmpegPath ? `ok (${ffmpegPath})` : 'NO DISPONIBLE — miniaturas desactivadas');

const THUMB_DIR = path.resolve(process.env.UPLOAD_FOLDER || path.join(__dirname, '..', 'uploads'), 'thumbs');
console.log('[thumbs] directorio de miniaturas:', THUMB_DIR);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function thumbnailPath(videoFilepath) {
  const base = path.basename(videoFilepath, path.extname(videoFilepath));
  return path.join(THUMB_DIR, `${base}.jpg`);
}

function generarMiniatura(videoFilepath) {
  ensureDir(THUMB_DIR);

  const output = thumbnailPath(videoFilepath);
  if (fs.existsSync(output)) return Promise.resolve(output);

  if (!ffmpegPath) return Promise.reject(new Error('ffmpeg no disponible para generar miniaturas'));

  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      [
        '-i', videoFilepath,
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        output,
      ],
      { timeout: 30000 },
      (err) => {
        if (err) reject(err);
        else if (!fs.existsSync(output)) reject(new Error(`ffmpeg terminó sin generar ${output}`));
        else resolve(output);
      }
    );
  });
}

module.exports = { generarMiniatura, thumbnailPath };