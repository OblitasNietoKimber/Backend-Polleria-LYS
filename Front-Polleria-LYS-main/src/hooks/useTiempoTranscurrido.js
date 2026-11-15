import { useEffect, useState } from "react";

// Convierte segundos a formato de cronómetro con soporte de días, horas y minutos:
// - Menor a 1 hora: "MM:SS" (ej. "14:25")
// - 1 hora a 24 horas: "1h 15m 20s"
// - Más de 24 horas: "1d 2h 10m"
export function formatTiempoTranscurrido(segundosTotales) {
  const segs = Math.max(0, Math.floor(segundosTotales));
  const dias = Math.floor(segs / 86400);
  const horas = Math.floor((segs % 86400) / 3600);
  const minutos = Math.floor((segs % 3600) / 60);
  const segundos = segs % 60;

  if (dias > 0) {
    return `${dias}d ${horas}h ${minutos}m`;
  }
  if (horas > 0) {
    return `${horas}h ${minutos}m ${String(segundos).padStart(2, "0")}s`;
  }
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

// Cronómetro en vivo desde "inicio". Si se pasa "congelarEn", deja de correr
// y muestra el tiempo total fijo entre inicio y esa fecha (para el historial).
export function useTiempoTranscurrido(inicio, congelarEn) {
  const [ahora, setAhora] = useState(() =>
    congelarEn ? new Date(congelarEn).getTime() : Date.now()
  );

  useEffect(() => {
    if (congelarEn) return;
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [congelarEn]);

  const segundosTotales = Math.max(
    0,
    Math.floor(((congelarEn ? new Date(congelarEn).getTime() : ahora) - new Date(inicio).getTime()) / 1000)
  );
  const minutos = Math.floor(segundosTotales / 60);
  const texto = formatTiempoTranscurrido(segundosTotales);

  return { texto, segundosTotales, minutos };
}
