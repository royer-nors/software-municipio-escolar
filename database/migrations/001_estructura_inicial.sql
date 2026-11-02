-- Base compatible con el esquema inicial, sin eliminar datos existentes.

CREATE TABLE IF NOT EXISTS estudiantes (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    ya_voto BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS candidatos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    lista VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS votos (
    id SERIAL PRIMARY KEY,
    candidato_id INT REFERENCES candidatos(id),
    fecha TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS administradores (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);
