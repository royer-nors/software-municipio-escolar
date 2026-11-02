const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createResultadosService } = require("../services/resultados.service");

function obtenerResultados(conteo) {
  return createResultadosService({ async obtenerConteo() { return conteo; } }).obtenerResultados();
}

test("calcula los porcentajes y la participación del ejemplo de Figma", async () => {
  const result = await obtenerResultados({
    habilitados: "1200", emitidos: "1000", blancos: "0",
    listas: [
      { nombre: "Ideas que transforman", votos: 104 },
      { nombre: "Juntos por un mejor futuro", votos: 501 },
      { nombre: "La fuerza de todos", votos: 67 },
      { nombre: "Unidos por el cambio", votos: 328 },
    ],
  });
  assert.deepEqual(result.resumen, {
    estudiantesHabilitados: 1200, votosEmitidos: 1000, votosValidos: 1000,
    votosEnBlanco: 0, votosNulos: 0, noVotaron: 200, participacion: 83.3,
  });
  assert.deepEqual(result.listas.map(lista => [lista.votos, lista.porcentaje, lista.posicion]), [
    [501, 50.1, 1], [328, 32.8, 2], [104, 10.4, 3], [67, 6.7, 4],
  ]);
  assert.equal(Number.isNaN(Date.parse(result.generadoEn)), false);
});

test("los blancos cuentan para participación pero no para el porcentaje por lista", async () => {
  const result = await obtenerResultados({
    habilitados: "20", emitidos: "10", blancos: "2",
    listas: [{ nombre: "Lista A", votos: 6 }, { nombre: "Lista B", votos: 2 }],
  });
  assert.deepEqual(result.listas.map(lista => lista.porcentaje), [75, 25]);
  assert.equal(result.resumen.participacion, 50);
  assert.equal(result.resumen.votosValidos, 8);
  assert.equal(result.resumen.noVotaron, 10);
});

test("un padrón vacío y una elección sin votos no generan divisiones por cero", async () => {
  for (const habilitados of ["0", "20"]) {
    const result = await obtenerResultados({ habilitados, emitidos: "0", blancos: "0", listas: [] });
    assert.equal(result.resumen.participacion, 0);
    assert.equal(result.resumen.noVotaron, Number(habilitados));
    assert.deepEqual(result.listas, []);
  }
});

test("conserva las listas en cero cuando todos los votos son blancos", async () => {
  const result = await obtenerResultados({
    habilitados: "5", emitidos: "5", blancos: "5", listas: [{ nombre: "Lista A", votos: 0 }],
  });
  assert.equal(result.listas[0].porcentaje, 0);
  assert.equal(result.listas[0].posicion, null);
  assert.equal(result.resumen.votosEnBlanco, 5);
  assert.equal(result.resumen.participacion, 100);
});

test("un empate comparte posición y no inventa un ganador", async () => {
  const result = await obtenerResultados({
    habilitados: "10", emitidos: "10", blancos: "0",
    listas: [{ nombre: "Lista C", votos: 2 }, { nombre: "Lista B", votos: 4 }, { nombre: "Lista A", votos: 4 }],
  });
  assert.deepEqual(result.listas.map(lista => [lista.nombre, lista.posicion]), [["Lista A", 1], ["Lista B", 1], ["Lista C", 3]]);
});

test("rechaza conteos contradictorios o datos electorales incompletos", async () => {
  const valid = { habilitados: "10", emitidos: "5", blancos: "0", listas: [{ nombre: "Lista A", votos: 5 }] };
  for (const change of [
    { emitidos: "11" }, { blancos: "6" }, { habilitados: "-1" }, { emitidos: null },
    { emitidos: "9007199254740992" }, { listas: null },
    { listas: [{ nombre: null, votos: 5 }] }, { listas: [{ nombre: "Lista A", votos: 4 }] },
  ]) {
    await assert.rejects(obtenerResultados({ ...valid, ...change }));
  }
});
