const fs = require("node:fs");
const path = require("node:path");

const config = {
  appId: "pe.softwaremunicipioescolar.puesto",
  productName: "Municipio Escolar – Puesto de votación",
  directories: { output: "release/puesto" },
  artifactName: "MunicipioEscolar-Puesto-Setup-${version}.${ext}",
  files: ["puesto/main.cjs", "puesto/preload.cjs", "puesto/*.html", "puesto/*.cjs", "package.json"],
  extraMetadata: { name: "software-municipio-escolar-puesto", main: "puesto/main.cjs" },
  asar: true,
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    include: "build/puesto.nsh",
  },
};

const icon = path.join(__dirname, "build", "icon.ico");
if (fs.existsSync(icon)) config.win = { icon: "build/icon.ico" };

module.exports = config;
