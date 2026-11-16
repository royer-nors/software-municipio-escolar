const bcrypt = require("bcryptjs");

function errorInicializacion(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validarCredenciales(usuario, password) {
  if (typeof usuario !== "string" || !usuario.trim() || usuario.trim().length > 50) {
    throw errorInicializacion(400, "El usuario debe tener entre 1 y 50 caracteres.");
  }
  if (typeof password !== "string" || password.length < 8 || bcrypt.truncates(password)) {
    throw errorInicializacion(400, "La contraseña debe tener al menos 8 caracteres y no superar el límite de bcrypt.");
  }
  return { usuario: usuario.trim(), password };
}

async function asegurarAdministradorInicial(pool, credenciales) {
  const { usuario, password } = validarCredenciales(credenciales?.usuario, credenciales?.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE administradores IN SHARE ROW EXCLUSIVE MODE");
    const existente = (await client.query("SELECT COUNT(*)::int AS total FROM administradores")).rows[0].total;
    if (existente > 0) throw errorInicializacion(409, "Ya existe un administrador.");
    const hash = await bcrypt.hash(password, 12);
    const creado = (await client.query(`INSERT INTO administradores
      (usuario, password_hash, activo, version_token)
      VALUES ($1, $2, TRUE, 1) RETURNING id, usuario, activo`, [usuario, hash])).rows[0];
    await client.query("COMMIT");
    return creado;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

module.exports = { asegurarAdministradorInicial, validarCredenciales };
