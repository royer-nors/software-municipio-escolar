const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DURACION_BLOQUEO_MS,
  crearHashClave,
  crearLimitadorIntentos,
  normalizarServidorUrl,
  validarClaveInicial,
  verificarHashClave,
} = require("../seguridad-local.cjs");

test("la clave se guarda como hash scrypt y solo coincide con la clave correcta", () => {
  const clave = "clave de prueba";
  const credencial = crearHashClave(clave);
  assert.equal(credencial.algoritmo, "scrypt");
  assert.equal(JSON.stringify(credencial).includes(clave), false);
  assert.equal(verificarHashClave(clave, credencial), true);
  assert.equal(verificarHashClave("otra clave", credencial), false);
  assert.equal(verificarHashClave(clave, { algoritmo: "otro", salt: "", hash: "" }), false);
});

test("exige cuatro caracteres y confirmación exacta de la clave inicial", () => {
  assert.doesNotThrow(() => validarClaveInicial("abcd", "abcd"));
  assert.throws(() => validarClaveInicial("abc", "abc"), /al menos 4/);
  assert.throws(() => validarClaveInicial("abcd", "abce"), /no coinciden/);
});

test("bloquea 30 segundos después del quinto intento fallido", () => {
  let ahora = 1000;
  const limitador = crearLimitadorIntentos({ reloj: () => ahora });
  for (let intento = 1; intento < 5; intento += 1) {
    assert.equal(limitador.registrarFallo().permitido, true);
  }
  const quinto = limitador.registrarFallo();
  assert.equal(quinto.permitido, false);
  assert.equal(quinto.restanteMs, DURACION_BLOQUEO_MS);
  assert.equal(limitador.consultar().permitido, false);
  ahora += DURACION_BLOQUEO_MS;
  assert.equal(limitador.consultar().permitido, true);
  assert.equal(limitador.registrarFallo().intentosRestantes, 4);
});

test("normaliza IP, IP con puerto y HTTPS; rechaza entradas inválidas", () => {
  assert.deepEqual(normalizarServidorUrl("192.168.1.20"), { url: "http://192.168.1.20:3000", aviso: "" });
  assert.deepEqual(normalizarServidorUrl("192.168.1.20:3210"), { url: "http://192.168.1.20:3210", aviso: "" });
  assert.deepEqual(normalizarServidorUrl("https://192.168.1.20:3000"), {
    url: "http://192.168.1.20:3000",
    aviso: "El servidor de la red local usa HTTP. Se cambió https:// por http://.",
  });
  for (const entrada of ["", "192.168.1.20:puerto", "http://usuario:clave@192.168.1.20", "http://192.168.1.20/api", "ftp://192.168.1.20"]) {
    assert.throws(() => normalizarServidorUrl(entrada), Error, `debe rechazar ${entrada}`);
  }
});
