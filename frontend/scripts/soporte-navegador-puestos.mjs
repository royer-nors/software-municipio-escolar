import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
export async function navegadorPuestos() {
  const carpeta = await mkdtemp(path.join(tmpdir(), "municipio-etapa5-chrome-"));
  let chrome, socket, salida = "", secuencia = 0;
  const pendientes = new Map();
  const enviar = (s, method, params = {}) => new Promise((resolve, reject) => {
    const id = ++secuencia;
    const timer = setTimeout(() => { pendientes.delete(id); reject(new Error(`Tiempo agotado: ${method}. ${salida.slice(-1000)}`)); }, 15000);
    pendientes.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params, ...(s ? { sessionId: s } : {}) }));
  });
  const cerrar = () => { if (socket?.readyState === WebSocket.OPEN) socket.close(); chrome?.kill(); };
  try {
    chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${carpeta}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const ws = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome no inició")), 15000);
      chrome.stderr.on("data", d => { salida += d; const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(salida); if (m) { clearTimeout(timer); resolve(m[1]); } });
      chrome.on("error", e => { clearTimeout(timer); reject(e); });
    });
    socket = new WebSocket(ws); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    socket.addEventListener("message", ({ data }) => {
      const m = JSON.parse(data);
      if (m.id) { const p = pendientes.get(m.id); if (p) { pendientes.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
      else if (m.method === "Page.javascriptDialogOpening") enviar(m.sessionId, "Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });
    async function evaluar(s, expression) {
      const r = await enviar(s, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error("Falló la comprobación DOM: " + expression);
      return r.result.value;
    }
    return {
      cerrar, enviar, evaluar,
      async abrir(url) {
        const c = await enviar(null, "Target.createBrowserContext");
        const t = await enviar(null, "Target.createTarget", { url: "about:blank", browserContextId: c.browserContextId, newWindow: true });
        const s = (await enviar(null, "Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
        await enviar(s, "Page.enable"); await enviar(s, "Page.navigate", { url }); return s;
      },
      async esperar(s, expression) {
        for (let n = 0; n < 160; n++) { if (await evaluar(s, expression)) return; await new Promise(r => setTimeout(r, 75)); }
        throw new Error("No se cumplió: " + expression);
      },
      escribir: (s, id, value) => evaluar(s, `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`),
      click: (s, texto) => evaluar(s, `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)})?.click()`),
    };
  } catch (e) { cerrar(); throw e; }
}
