module.exports = {
  appId: "pe.softwaremunicipioescolar.servidor",
  productName: "Municipio Escolar Servidor",
  directories: { output: "release" },
  files: ["servidor/**/*", "package.json"],
  asar: true,
  extraResources: [
    {
      from: "../backend",
      to: "backend",
      filter: ["**/*", "!node_modules/**", "!test/**", "!test-support/**", "!scripts/**", "!**/.env*", "!**/*.md"],
    },
    { from: "../backend/node_modules", to: "backend/node_modules", filter: ["**/*"] },
    { from: "../database/migrations", to: "database/migrations", filter: ["**/*.sql"] },
    { from: "../frontend/dist", to: "frontend/dist", filter: ["**/*"] },
  ],
};
