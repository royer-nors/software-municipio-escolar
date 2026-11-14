// Laboratorio LOCAL efímero. No carga .env ni utiliza PostgreSQL instalado.
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { crearEntorno } = require("../test-support/entorno-votacion-puesto");
const { createApp } = require("../app");
async function iniciarDemo({ port = 4185 } = {}) {
  const raiz = path.resolve(__dirname, "../../frontend");
  const carpeta = await mkdtemp(path.join(tmpdir(), "municipio-demo-puestos-"));
  const dist = path.join(carpeta, "dist");
  const build = spawn(process.execPath, [path.join(raiz, "node_modules/vite/bin/vite.js"), "build", "--outDir", dist], {
    cwd: raiz, windowsHide: true, env: { ...process.env, VITE_API_URL: "/api" }, stdio: "ignore",
  });
  if ((await once(build, "exit"))[0] !== 0) throw new Error("No se pudo compilar el frontend temporal de pruebas.");
  const entorno = await crearEntorno({ real: false }); let server;
  try {
    await entorno.db.exec(`UPDATE configuracion_votacion SET votacion_abierta=TRUE,voto_blanco_habilitado=TRUE,automatica=FALSE;
      INSERT INTO computadoras(identificador,nombre,grado) VALUES ('PC-01','Demo aula A',3),('PC-02','Demo aula B',3);
      INSERT INTO estudiantes(codigo,nombre,grado) VALUES ('01234567','Ana Demo','3°'),('12345678','Bruno Demo','3'),('33333333','Carla Demo','2'),('44444444','Diego Demo','3');
      INSERT INTO listas(id,nombre,numero,propuestas) VALUES (10,'Lista A',1,ARRAY['Mejorar la biblioteca']),(20,'Lista B',2,ARRAY['Promover el deporte']);
      INSERT INTO candidatos(nombre,lista_id,cargo) VALUES ('Candidata A',10,'Alcaldesa'),('Candidato B',20,'Alcalde');`);
    await entorno.db.query("INSERT INTO administradores(usuario,password_hash) VALUES ($1,$2)", ["admin-demo", bcrypt.hashSync("SoloPruebas2026!", 4)]);
    const red = { origenes: [], permitirOrigenNull: false };
    const app = createApp({ pool: entorno.pool, jwtSecret: randomBytes(32).toString("hex"), red, puesto: { secure: false } });
    // Servir únicamente el build temporal, nunca la raíz del proyecto.
    app.use(express.static(dist));
    app.get("/puesto", (req, res) => res.set("Cache-Control", "no-store").sendFile(path.join(dist, "index.html")));
    server = app.listen(port, "127.0.0.1"); await once(server, "listening");
    const url = `http://127.0.0.1:${server.address().port}`; red.origenes.push(url);
    return { url, db: entorno.db, async cerrar() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await entorno.cerrar(); } };
  } catch (e) {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await entorno.cerrar(); throw e;
  }
}
if (require.main === module) {
  iniciarDemo().then(demo => {
    console.log(`DEMO LOCAL EN MEMORIA: ${demo.url}`);
    console.log("Administrador ficticio: admin-demo / SoloPruebas2026!");
    console.log("Puestos: /puesto en perfiles separados. DNI demo: 01234567 y 12345678 (grado 3); 33333333 (grado 2, debe rechazarse).");
    console.log("Ninguna conexión a PostgreSQL instalado. Ctrl+C finaliza solamente esta demo.");
    let cerrando = false;
    const cerrar = async () => { if (cerrando) return; cerrando = true; await demo.cerrar(); process.exitCode = 0; };
    process.on("SIGINT", cerrar); process.on("SIGTERM", cerrar);
  }).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { iniciarDemo };
