
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ruta para comprobar Express
app.get("/api/estado", (req, res) => {
  res.json({
    mensaje: "Servidor Municipio Escolar funcionando",
    estado: "activo"
  });
});

// Ruta para comprobar PostgreSQL
app.get("/api/database", async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT current_database() AS base_datos, NOW() AS fecha"
    );

    res.json({
      mensaje: "Conexión exitosa a PostgreSQL",
      datos: resultado.rows[0]
    });

  } catch (error) {
    console.error("Error PostgreSQL:", error.message);

    res.status(500).json({
      mensaje: "Error al conectar con PostgreSQL"
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
