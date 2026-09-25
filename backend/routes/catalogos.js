// routes/catalogos.js — razas y colores para llenar los <select> del formulario
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/razas', async (req, res) => {
  const [filas] = await pool.query('SELECT id, nombre FROM razas ORDER BY nombre');
  res.json(filas);
});

router.get('/colores', async (req, res) => {
  const [filas] = await pool.query('SELECT id, nombre FROM colores ORDER BY nombre');
  res.json(filas);
});

module.exports = router;