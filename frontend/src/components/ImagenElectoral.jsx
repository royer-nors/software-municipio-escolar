import { useState } from "react";
import { urlImagen } from "../utils/imagenes";
export default function ImagenElectoral({ src, alt, className = "" }) {
  const url = urlImagen(src);
  const [errorUrl, setErrorUrl] = useState(null);
  const fallo = !url || errorUrl === url;
  return <span className={`imagen-electoral ${className}`}>
    <img src={url || undefined} alt={alt} loading="eager" onError={() => setErrorUrl(url)}
      className={fallo ? "imagen-electoral-fallo" : ""} />
    {fallo && <span role="status">Imagen no disponible</span>}
  </span>;
}
