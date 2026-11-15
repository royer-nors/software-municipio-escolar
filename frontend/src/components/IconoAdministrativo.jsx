export default function IconoAdministrativo({ nombre, ...props }) {
  const suave = { fill: "currentColor", fillOpacity: .23, stroke: "none" };
  const acento = "var(--admin-icono-acento, #a9efd3)";
  const iconos = {
    colegio: <><path d="M3 10h18v11H3z" {...suave} /><path d="m2 10 10-7 10 7M4 10v11h16V10M2 21h20M9 21v-6h6v6" /><path d="M12 3V1h5v3h-5" fill={acento} stroke="none" /><path d="M7 12h.01M17 12h.01" strokeWidth="2.8" /><circle cx="12" cy="9" r="1.5" fill={acento} stroke="none" /></>,
    estudiantes: <><circle cx="9" cy="7.5" r="3.5" {...suave} /><path d="M2 21v-3a7 7 0 0 1 14 0v3z" {...suave} /><circle cx="9" cy="7.5" r="3.5" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4.5a3.5 3.5 0 0 1 0 7M19 15a6 6 0 0 1 3 5" /><path d="m7 16 2 2 3-4" stroke={acento} strokeWidth="2" /></>,
    listas: <><rect x="4" y="4" width="16" height="18" rx="3" {...suave} /><rect x="4" y="4" width="16" height="18" rx="3" /><rect x="8" y="2" width="8" height="4" rx="1.5" fill={acento} stroke="none" /><path d="m8 11 1.5 1.5L12 10m-4 7 1.5 1.5L12 16" stroke={acento} /><path d="M15 11h2M15 17h2" /></>,
    computadora: <><rect x="2" y="3" width="20" height="15" rx="3" {...suave} /><rect x="2" y="3" width="20" height="15" rx="3" /><path d="M8 22h8M12 18v4M2 14h20" /><path d="m8 9 2.5 2L16 6.5" stroke={acento} strokeWidth="2" /></>,
    urna: <><rect x="2" y="12" width="20" height="10" rx="3" {...suave} /><path d="M5 12H2v10h20V12h-4M8 16h8" /><path d="m10 2 7 5-5 7-7-5z" fill="currentColor" fillOpacity=".35" /><path d="m10 2 7 5-5 7-7-5z" /><path d="m9 7 1 2 3-1" stroke={acento} strokeWidth="2" /></>,
    documento: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...suave} /><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12h6M8 16h3" /><circle cx="17" cy="18" r="4" fill={acento} stroke="none" /><path d="m15.3 18 1.1 1.1 2.1-2.3" stroke="#125c45" strokeWidth="1.6" /></>,
    escudo: <><path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z" {...suave} /><path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z" /><rect x="8" y="11" width="8" height="6" rx="1.5" fill={acento} stroke="none" /><path d="M10 11V9a2 2 0 0 1 4 0v2" stroke={acento} /><circle cx="12" cy="14" r=".8" fill="#125c45" stroke="none" /></>,
    grafico: <><rect x="6" y="12" width="4" height="7" rx="1" fill="currentColor" fillOpacity=".5" stroke="none" /><rect x="12" y="8" width="4" height="11" rx="1" fill="currentColor" stroke="none" /><rect x="18" y="3" width="4" height="16" rx="1" fill={acento} stroke="none" /><path d="M2 3v19h20" /></>,
    borrar: <><path d="m5 7 1 15h12l1-15z" {...suave} /><path d="M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v7M14 10v7" /></>,
    salir: <><path d="M9 4H4v16h5M14 8l4 4-4 4M9 12h12" /></>,
    flecha: <path d="M4 12h16m-6-6 6 6-6 6" />,
    volver: <path d="M20 12H4m6-6-6 6 6 6" />,
    actualizar: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" /></>,
    imprimir: <><path d="M6 8V2h12v6M6 17H3V9h18v8h-3M6 14h12v8H6z" /><path d="M17 11h1" strokeWidth="2.6" /></>,
  };

  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{iconos[nombre]}</svg>;
}
