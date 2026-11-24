const fs = require("node:fs/promises");

class ControlVentanaPuesto {
  constructor({ archivo, safeStorage, consultar, reiniciarVista }) {
    Object.assign(this, { archivo, safeStorage, consultar, reiniciarVista });
    this.pendiente = false; this.incierto = false; this.cola = Promise.resolve(); this.datos = null;
    this.eleccionProtegida = false;
  }
  get protegida() { return this.eleccionProtegida || this.pendiente || this.incierto; }
  enSerie(fn) { const r = this.cola.then(fn); this.cola = r.catch(() => {}); return r; }
  async cargar() {
    try {
      const d = JSON.parse(await fs.readFile(this.archivo, "utf8"));
      if (d.version !== 1 || d.pendiente !== true || typeof d.origen !== "string") throw Error("Estado no válido");
      this.datos = d; this.pendiente = true; this.incierto = true;
      if (d.token) {
        if (!this.safeStorage.isEncryptionAvailable()) throw Error("Sin cifrado local");
        this.token = this.safeStorage.decryptString(Buffer.from(d.token, "base64"));
      }
    } catch (e) { if (e.code !== "ENOENT") { this.pendiente = true; this.incierto = true; } }
  }
  conectar(ventana) {
    this.ventana = ventana;
    ventana.on("leave-full-screen", () => { if (this.protegida) this.aplicarBloqueo(); });
    ventana.on("minimize", () => { if (this.protegida) { ventana.restore(); this.aplicarBloqueo(); } });
    if (this.protegida) this.aplicarBloqueo();
  }
  actualizarEleccion(proteger) {
    const anterior = this.protegida;
    if (!anterior && proteger) this.capturarVentana();
    this.eleccionProtegida = proteger;
    if (!anterior && this.protegida) this.aplicarBloqueo();
    if (anterior && !this.protegida) this.restaurarVentana();
  }
  capturarVentana() {
    this.bounds = this.ventana?.getNormalBounds();
    this.maximizada = this.ventana?.isMaximized();
  }
  restaurarVentana() {
    const w = this.ventana;
    if (!w || w.isDestroyed()) return;
    w.setKiosk(false); w.setFullScreen(false);
    w.setClosable(true); w.setMinimizable(true); w.setMaximizable(true);
    if (this.bounds) w.setBounds(this.bounds);
    if (this.maximizada) w.maximize();
    this.bounds = undefined; this.maximizada = false;
  }
  aplicarBloqueo() {
    const w = this.ventana; if (!w || w.isDestroyed()) return;
    w.setKiosk(true); w.setFullScreen(true);
    w.setClosable(false); w.setMinimizable(false); w.setMaximizable(false);
  }
  async guardar(datos) {
    const temporal = this.archivo + ".tmp";
    const f = await fs.open(temporal, "w", 0o600);
    try { await f.writeFile(JSON.stringify(datos)); await f.sync(); } finally { await f.close(); }
    await fs.rename(temporal, this.archivo); this.datos = datos;
  }
  iniciar(origen) {
    const nueva = !this.pendiente;
    if (nueva) {
      if (!this.protegida) this.capturarVentana();
      this.pendiente = true;
    }
    this.aplicarBloqueo();
    return this.enSerie(async () => {
      if (!nueva) {
        if (!this.datos || this.datos.origen !== origen) throw Error("Estado pendiente no verificable");
        return { ok: true };
      }
      try { await this.guardar({ version: 1, pendiente: true, origen }); }
      catch (e) { this.incierto = true; throw e; }
      return { ok: true };
    });
  }
  registrar(token, origen) {
    return this.enSerie(async () => {
      if (!this.pendiente || origen !== this.datos?.origen || typeof token !== "string" || token.length > 4096) throw Error("Sesión no verificable");
      const d = await this.consultar(token, origen);
      if (d.estado !== "activa" || !/^[a-f0-9]{64}$/.test(d.referencia || "") ||
          (this.datos.referencia && this.datos.referencia !== d.referencia)) throw Error("No se puede reemplazar una sesión pendiente");
      if (!this.safeStorage.isEncryptionAvailable()) throw Error("El cifrado local no está disponible");
      await this.guardar({ ...this.datos, referencia: d.referencia, token: this.safeStorage.encryptString(token).toString("base64") });
      this.token = token; this.incierto = false;
      return { ok: true };
    });
  }
  marcarIncierto() { if (this.pendiente) { this.incierto = true; this.aplicarBloqueo(); } }
  resolver(origen, finalizar = false) {
    return this.enSerie(async () => {
      if (!this.pendiente) return { ok: true };
      if (!this.token || origen !== this.datos?.origen) return { ok: false };
      if (!finalizar && !this.incierto && this.datos.finalizacionSolicitada !== true) return { ok: false };
      try {
        if (finalizar && this.datos.finalizacionSolicitada !== true) {
          await this.guardar({ ...this.datos, finalizacionSolicitada: true });
        }
        const d = await this.consultar(this.token, origen);
        if (d.estado !== "registrada" && this.datos.finalizacionSolicitada === true) {
          await this.guardar({ ...this.datos, finalizacionSolicitada: false });
        }
        if (d.estado !== "registrada" || d.referencia !== this.datos.referencia || d.pendientes !== 0) return { ok: false };
        if (this.datos.finalizacionSolicitada !== true) return { ok: false, requiereFinalizar: true };
        // Retirar el DOM anterior antes de volver a habilitar los botones nativos.
        await this.reiniciarVista();
        await fs.unlink(this.archivo);
        this.pendiente = false; this.incierto = false; this.token = null; this.datos = null;
        if (!this.protegida) this.restaurarVentana();
        return { ok: true };
      } catch { this.marcarIncierto(); return { ok: false }; }
    });
  }
}
module.exports = { ControlVentanaPuesto };
