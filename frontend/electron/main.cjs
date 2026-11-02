
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Software Municipio Escolar",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  if (app.isPackaged) {
    ventana.loadFile(
      path.join(__dirname, "../dist/index.html")
    );
  } else {
    ventana.loadURL("http://localhost:5173");
  }
}

app.whenReady().then(() => {
  crearVentana();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      crearVentana();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
