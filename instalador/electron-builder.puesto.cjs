module.exports = {
  appId: "pe.softwaremunicipioescolar.puesto",
  productName: "Municipio Escolar Puesto",
  directories: { output: "release/puesto" },
  files: ["puesto/**/*", "package.json"],
  extraMetadata: {
    name: "software-municipio-escolar-puesto",
    main: "puesto/main.cjs",
  },
  asar: true,
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
};
