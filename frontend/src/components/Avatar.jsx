// Retrato de reemplazo: todavía no hay fotos de candidatos en la base de datos.
export default function Avatar({ tono = "#1f4e8c", tam = 64 }) {
  return (
    <svg viewBox="0 0 64 64" width={tam} height={tam} aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#dbe7f5" />
      <circle cx="32" cy="25" r="10" fill="#f0c9a4" />
      <path d="M14 56c3-10 10-15 18-15s15 5 18 15z" fill={tono} />
    </svg>
  );
}
