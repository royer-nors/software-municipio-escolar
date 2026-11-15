function gradoSecundaria(valor) {
  const coincidencia = typeof valor === "string" && /^\s*([1-5])\s*(?:\.\s*)?[°º]?(?:\s*(?:de\s+)?secundaria)?\s*$/iu.exec(valor);
  return coincidencia ? Number(coincidencia[1]) : null;
}
module.exports = { gradoSecundaria };
