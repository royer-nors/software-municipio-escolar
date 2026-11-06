function validarDNI(dni) {
    return typeof dni === "string" && /^\d{8}$/.test(dni);
}

function verificarEstudiante(dni, estudiantes) {
    if (!validarDNI(dni)) {
        return {
            permitido: false,
            mensaje: "DNI invalido"
        };
    }

    const estudiante = estudiantes.find(
        (e) => e.dni === dni
    );

    if (!estudiante) {
        return {
            permitido: false,
            mensaje: "Estudiante no registrado en el padron"
        };
    }

    return {
        permitido: estudiante.habilitado === true,
        mensaje: estudiante.habilitado
            ? "Estudiante habilitado"
            : "Estudiante no habilitado"
    };
}

module.exports = { validarDNI, verificarEstudiante };
