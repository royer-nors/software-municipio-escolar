
const path = require("node:path");
const bcrypt = require("bcryptjs");
const readline = require("node:readline");

require("dotenv").config({
  path: path.join(__dirname, "../.env")
});

const pool = require("../config/db");

async function main() {
  const db = await pool.query("SELECT current_database() AS nombre");
  const nombreDB = db.rows[0].nombre;

  if (nombreDB !== "db_municipio_escolar_pruebas") {
    throw new Error(
      "Operación cancelada: no estás conectado a la base de pruebas."
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const preguntar = (texto) =>
      new Promise((resolve) => rl.question(texto, resolve));

    const usuario = (await preguntar("Usuario administrador: ")).trim();
    const password = await preguntar("Contraseña nueva: ");

    if (!usuario || usuario.length > 50) {
      throw new Error("El usuario debe tener entre 1 y 50 caracteres.");
    }

    if (password.length < 8 || bcrypt.truncates(password)) {
      throw new Error("La contraseña debe tener al menos 8 caracteres y no superar el límite de bcrypt.");
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO administradores
         (usuario, password_hash, activo, version_token)
       VALUES ($1, $2, true, 1)`,
      [usuario, hash]
    );

    console.log("Administrador de pruebas creado correctamente.");
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
