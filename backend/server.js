const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const pool = require("./config/db");
const { createApp } = require("./app");
const app = createApp({ pool, jwtSecret: process.env.JWT_SECRET });
const port = process.env.PORT || 3000;
app.listen(port, "127.0.0.1", () => {
  console.log(`Servidor funcionando en http://localhost:${port}`);
});
