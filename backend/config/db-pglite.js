const fs = require("node:fs/promises");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

async function crearPoolPGlite({ dataDir } = {}) {
  if (!dataDir) throw new Error("DATA_DIR es obligatorio para la base PGlite persistente.");
  await fs.mkdir(dataDir, { recursive: true });
  const db = await PGlite.create({ dataDir: path.resolve(dataDir) });
  let cola = Promise.resolve();
  let cerrado = false;
  let cerrando;

  async function tomar() {
    if (cerrado) throw new Error("La base PGlite ya está cerrada.");
    const anterior = cola;
    let liberar;
    cola = new Promise(resolve => { liberar = resolve; });
    await anterior;
    if (cerrado) { liberar(); throw new Error("La base PGlite ya está cerrada."); }
    return liberar;
  }

  async function ejecutar(sql, values) {
    return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values);
  }

  async function close() {
    if (cerrando) return cerrando;
    cerrando = (async () => {
      const liberar = await tomar();
      try { cerrado = true; await db.close(); } finally { liberar(); }
    })();
    return cerrando;
  }

  return {
    async query(sql, values) {
      const liberar = await tomar();
      try { return await ejecutar(sql, values); } finally { liberar(); }
    },
    async connect() {
      const liberar = await tomar();
      let liberado = false;
      return {
        query: (sql, values) => ejecutar(sql, values),
        release() { if (!liberado) { liberado = true; liberar(); } },
      };
    },
    close,
    end: close,
  };
}

module.exports = { crearPoolPGlite };
