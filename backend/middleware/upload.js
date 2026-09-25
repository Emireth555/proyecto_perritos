// middleware/upload.js
//
// Reglas que cumple este módulo (del enunciado del proyecto):
// - Las imágenes se guardan en RUTA_IMAGENES, fuera del código del proyecto.
// - El backend genera el nombre del archivo, nunca usa el nombre que mandó el usuario.
// - Se valida que el archivo realmente sea una imagen (magic bytes), no solo la extensión.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const RUTA_IMAGENES = process.env.RUTA_IMAGENES;

if (!RUTA_IMAGENES) {
  throw new Error('Falta configurar RUTA_IMAGENES en el .env');
}

if (!fs.existsSync(RUTA_IMAGENES)) {
  fs.mkdirSync(RUTA_IMAGENES, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RUTA_IMAGENES),
  filename: (req, file, cb) => {
    const nombreUnico = crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    cb(null, nombreUnico);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.mimetype)) {
      return cb(new Error('Formato no permitido. Solo JPG, PNG o WEBP.'));
    }
    cb(null, true);
  },
});

const FIRMAS = {
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],
};

function coincideFirma(buffer, firma) {
  return firma.every((byte, i) => buffer[i] === byte);
}

function validarContenidoImagen(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'Falta la foto' });
  }

  const buffer = fs.readFileSync(req.file.path, { flag: 'r' }).subarray(0, 12);

  const esValida =
    coincideFirma(buffer, FIRMAS.jpg) ||
    coincideFirma(buffer, FIRMAS.png) ||
    (coincideFirma(buffer, FIRMAS.webp) && buffer.slice(8, 12).toString('ascii') === 'WEBP');

  if (!esValida) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El archivo no es una imagen válida' });
  }

  next();
}

module.exports = { upload, validarContenidoImagen, RUTA_IMAGENES };
