const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const BASE = path.resolve(process.env.UPLOAD_FOLDER || path.join(__dirname, '..', 'uploads'));

['videos', 'imagenes', 'portadas', 'thumbs'].forEach(d => {
  fs.mkdirSync(path.join(BASE, d), { recursive: true });
});

const videoStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, path.join(BASE, 'videos'));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${uuid()}${ext}`);
  },
});

const imageStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, path.join(BASE, 'imagenes'));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

const coverStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, path.join(BASE, 'portadas'));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

const MAX_VIDEO_MB = parseInt(process.env.MAX_VIDEO_MB, 10) || 500;
const MAX_IMAGE_MB = parseInt(process.env.MAX_IMAGE_MB, 10) || 10;

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('El archivo debe ser un video'));
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('El archivo debe ser una imagen'));
  },
});

const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('La portada debe ser una imagen'));
  },
});

module.exports = { uploadVideo, uploadImage, uploadCover };