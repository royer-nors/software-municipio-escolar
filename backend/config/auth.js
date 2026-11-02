const JWT_ISSUER = "municipio-escolar";
const JWT_AUDIENCE = "municipio-escolar-admin";
const TOKEN_DURATION_SECONDS = 3600;
const STUDENT_JWT_AUDIENCE = "municipio-escolar-estudiante";
const STUDENT_TOKEN_DURATION_SECONDS = 900;

function validateJwtSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Configura JWT_SECRET con al menos 32 bytes en backend/.env.");
  }
  return secret;
}

module.exports = {
  JWT_ISSUER, JWT_AUDIENCE, TOKEN_DURATION_SECONDS,
  STUDENT_JWT_AUDIENCE, STUDENT_TOKEN_DURATION_SECONDS, validateJwtSecret,
};
