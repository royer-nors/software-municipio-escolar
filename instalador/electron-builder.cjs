const fs = require("node:fs");
const path = require("node:path");

const config = {
  appId: "pe.softwaremunicipioescolar.servidor",
  productName: "Municipio Escolar – Servidor",
  directories: { output: "release/servidor" },
  artifactName: "MunicipioEscolar-Servidor-Setup-${version}.${ext}",
  files: ["servidor/**/*", "package.json"],
  asar: true,
  extraResources: [
    {
      from: "../backend",
      to: "backend",
      filter: ["**/*", "!node_modules/**", "!test/**", "!test-support/**", "!scripts/**", "!**/.env*", "!**/*.md"],
    },
    { from: "staging/servidor/backend/node_modules", to: "backend/node_modules", filter: ["**/*"] },
    { from: "../database/migrations", to: "database/migrations", filter: ["**/*.sql"] },
    { from: "../frontend/dist", to: "frontend/dist", filter: ["**/*"] },
  ],
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    include: "build/servidor.nsh",
  },
};

const icon = path.join(__dirname, "build", "icon.ico");
if (fs.existsSync(icon)) config.win = { icon: "build/icon.ico" };

module.exports = config;
