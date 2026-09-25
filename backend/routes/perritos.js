// routes/perritos.js
//
// PARADIGMA: este archivo es mayormente IMPERATIVO (Express controla el flujo
// paso a paso: validar -> guardar -> responder). Las partes DECLARATIVAS están
// marcadas explícitamente: son las consultas SQL.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { upload, validarContenidoImagen, RUTA_IMAGENES } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// POST /api/perritos — crear un registro (IDEMPOTENTE)
// ---------------------------------------------------------------------------
router.post('/', upload.single('foto'), validarContenidoImagen, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      idempotency_key,
      nombre,
      raza_id,
      color_principal_id,
      colores_adicionales,
      latitud,
      longitud,
    } = req.body;

    if (!idempotency_key) {
      return res.status(400).json({ error: 'Falta la clave de idempotencia' });
    }
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'Falta el nombre' });
    }
    if (!color_principal_id) {
      return res.status(400).json({ error: 'Falta el color principal' });
    }
    if (!latitud || !longitud) {
      return res.status(400).json({ error: 'Falta la ubicación' });
    }

    let coloresExtra = [];
    if (colores_adicionales) {
      try {
        coloresExtra = JSON.parse(colores_adicionales);
      } catch {
        return res.status(400).json({ error: 'Colores adicionales mal formados' });
      }
    }
    if (coloresExtra.length > 2) {
      return res.status(400).json({ error: 'Máximo 2 colores adicionales' });
    }
    if (coloresExtra.includes(Number(color_principal_id))) {
      return res.status(400).json({ error: 'Un color no puede repetirse' });
    }
    if (new Set(coloresExtra).size !== coloresExtra.length) {
      return res.status(400).json({ error: 'No se puede repetir un color adicional' });
    }

    // --- Chequeo de idempotencia ---
    const [existentes] = await conn.query(
      'SELECT id FROM perritos WHERE idempotency_key = ?',
      [idempotency_key]
    );

    if (existentes.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      const perritoExistente = await obtenerPerritoCompleto(existentes[0].id);
      return res.status(200).json(perritoExistente);
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Falta la foto' });
    }

    await conn.beginTransaction();

    const [resultado] = await conn.query(
      `INSERT INTO perritos
        (idempotency_key, nombre, foto_archivo, raza_id, color_principal_id, latitud, longitud, fecha_registro)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [idempotency_key, nombre.trim(), req.file.filename, raza_id || null, color_principal_id, latitud, longitud]
    );

    const perritoId = resultado.insertId;

    if (coloresExtra.length > 0) {
      const valores = coloresExtra.map((colorId) => [perritoId, colorId]);
      await conn.query('INSERT INTO perrito_colores (perrito_id, color_id) VALUES ?', [valores]);
    }

    await conn.commit();

    const perritoCreado = await obtenerPerritoCompleto(perritoId);
    return res.status(201).json(perritoCreado);
  } catch (err) {
    await conn.rollback();
    if (req.file) fs.unlinkSync(req.file.path);
    console.error(err);
    return res.status(500).json({ error: 'No se pudo registrar el perrito' });
  } finally {
    conn.release();
  }
});

// GET /api/perritos — lista (DECLARATIVO: JOIN resuelto por MySQL)
router.get('/', async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT p.id, p.nombre, p.foto_archivo, p.latitud, p.longitud, p.fecha_registro,
             r.nombre AS raza, c.nombre AS color_principal
      FROM perritos p
      LEFT JOIN razas r ON r.id = p.raza_id
      JOIN colores c ON c.id = p.color_principal_id
      ORDER BY p.fecha_registro DESC
    `);
    res.json(filas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener la lista de perritos' });
  }
});

// GET /api/perritos/:id — detalle
router.get('/:id', async (req, res) => {
  try {
    const perrito = await obtenerPerritoCompleto(req.params.id);
    if (!perrito) return res.status(404).json({ error: 'Perrito no encontrado' });
    res.json(perrito);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el registro' });
  }
});

// GET /api/perritos/estadisticas/por-color — AGREGACIÓN declarativa
router.get('/estadisticas/por-color', async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT c.nombre AS color, COUNT(*) AS total
      FROM perritos p
      JOIN colores c ON c.id = p.color_principal_id
      GROUP BY c.nombre
      ORDER BY total DESC
    `);
    res.json(filas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo calcular la estadística' });
  }
});

// GET /api/imagenes/:archivo — sirve la imagen vía backend
router.get('/imagenes/:archivo', (req, res) => {
  const archivo = path.basename(req.params.archivo);
  const ruta = path.join(RUTA_IMAGENES, archivo);
  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }
  res.sendFile(ruta);
});

async function obtenerPerritoCompleto(id) {
  const [[perrito]] = await pool.query(
    `
    SELECT p.id, p.nombre, p.foto_archivo, p.latitud, p.longitud, p.fecha_registro,
           r.nombre AS raza, c.nombre AS color_principal
    FROM perritos p
    LEFT JOIN razas r ON r.id = p.raza_id
    JOIN colores c ON c.id = p.color_principal_id
    WHERE p.id = ?
  `,
    [id]
  );

  if (!perrito) return null;

  const [coloresExtra] = await pool.query(
    `
    SELECT c.nombre
    FROM perrito_colores pc
    JOIN colores c ON c.id = pc.color_id
    WHERE pc.perrito_id = ?
  `,
    [id]
  );

  return { ...perrito, colores_adicionales: coloresExtra.map((c) => c.nombre) };
};

module.exports = router;