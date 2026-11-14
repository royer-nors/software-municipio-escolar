const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const pool = require("./config/db");
const { createApp } = require("./app");
const { configurarRed } = require("./config/red");
const { configurarPuesto } = require("./config/puesto");
const red = configurarRed(process.env);
const app = createApp({ pool, jwtSecret: process.env.JWT_SECRET, red, puesto: configurarPuesto(process.env) });
app.listen(red.port, red.host, () => {
  console.log(`Servidor escuchando en ${red.host}:${red.port}`);
});
