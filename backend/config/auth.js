const JWT_ISSUER = "municipio-escolar";
const JWT_AUDIENCE = "municipio-escolar-admin";
const TOKEN_DURATION_SECONDS = 3600;

function validateJwtSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Configura JWT_SECRET con al menos 32 bytes en backend/.env.");
  }
  return secret;
}

module.exports = { JWT_ISSUER, JWT_AUDIENCE, TOKEN_DURATION_SECONDS, validateJwtSecret };
