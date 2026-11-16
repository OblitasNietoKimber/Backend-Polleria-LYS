// Un tono por método, validado para daltonismo y separación entre todos los pares.
export const COLORES_METODO = {
  yape: "#7B2FB5", // morado
  plin: "#1BAF7A", // turquesa
  tarjeta: "#2A78D6", // azul
  efectivo: "#C98500", // ámbar
};

export function obtenerColorMetodo(nombre = "") {
  const norm = String(nombre).toLowerCase().trim();
  const metodo = Object.keys(COLORES_METODO).find((clave) => norm.includes(clave));
  return metodo ? COLORES_METODO[metodo] : "#8A8178";
}
