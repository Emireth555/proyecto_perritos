require('dotenv').config();
const express = require('express');
const cors = require('cors');

const perritosRouter = require('./routes/perritos');
const catalogosRouter = require('./routes/catalogos');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/perritos', perritosRouter);
app.use('/api', catalogosRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});