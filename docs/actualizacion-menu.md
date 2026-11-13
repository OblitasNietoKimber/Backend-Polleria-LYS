# Actualización de los pollos y ofertas

Rama: `feature/catalogo-productos`. Backend: **Backend-Polleria-LYS**.

Los precios y las cantidades de los combos se tomaron de la página 1 de `carta-loko-brasa-12-paginas.pdf`, proporcionada por el usuario. Las descripciones se basan en las siete imágenes indicadas y los acompañamientos de la carta; no se cambia la marca del sitio ni se añaden otros platos del PDF.

Todas las opciones pertenecen a la categoría existente `pollos` (Pollos a la Leña). Las URLs conservan el prefijo `https://res.cloudinary.com/y08rn1qr/image/upload/v1792377256/` y solo cambia el nombre de archivo.

| Producto | Archivo | Precio | Acción |
|---|---|---|---|
| 1/4 Pollo a la brasa | Cuarto_de_pollo.png | S/ 16.00 | Actualiza el ID 3 |
| 1/4 Pollo a la brasa con anticucho y chorizo | Cuarto_de_pollo_con_anticucho_y_chorizo.png | S/ 20.00 | Añade el ID 18 |
| 1/2 Pollo a la brasa | Medio_pollo.png | S/ 29.00 | Actualiza el ID 2 |
| Pollo a la brasa entero | Pollo_entero.png | S/ 56.00 | Actualiza el ID 1 |
| Oferta | Oferta.png | S/ 61.00 | Añade el ID 19 |
| Ofertón | Oferton.png | S/ 66.00 | Añade el ID 20 |
| Súper Ofertón | Super_oferton.png | S/ 76.00 | Añade el ID 21 |

Los siete incluyen papas fritas y ensalada. El cuarto combinado incluye anticucho y chorizo. Oferta incluye un pollo entero; Ofertón, un pollo entero más un cuarto; Súper Ofertón, un pollo entero más medio pollo. Las tres ofertas incluyen gaseosa de 1.5 L, sin asignar una marca que no aparece en la imagen.

## Persistencia y prevención de duplicados

Se añaden las migraciones 017, 018 y 019, sin editar las anteriores. La numeración parte después de la 016, ya registrada en el backend por otros módulos. No se reproducen ni modifican esas migraciones ajenas a esta rama.

- 017 actualiza los tres pollos existentes y conserva sus IDs. Se detiene si no encuentra los tres productos esperados.
- 018 y 019 reutilizan registros por nombre equivalente o imagen antes de insertar. Aceptan espacios, mayúsculas y las variantes sin tilde previstas. Si encuentran más de una coincidencia, detienen la migración para evitar borrar o fusionar productos vinculados a pedidos.
- Las actualizaciones conservan la disponibilidad existente. Los cuatro productos nuevos se crean disponibles y con IDs generados por PostgreSQL.
- Repetir estas migraciones no crea registros adicionales. El ejecutor también omite migraciones registradas con la misma firma.

Las tres migraciones ya se aplicaron en Backend-Polleria-LYS con `scripts/apply-migrations.mjs`. El catálogo pasó de 17 a 21 productos: tres actualizados, cuatro nuevos y los otros catorce intactos. No se cambiaron pedidos, perfiles ni permisos. El frontend conserva sus consultas a PostgreSQL; no se añade otro catálogo estático ni se modifican las simulaciones de otros módulos.

## Verificación

- Las siete imágenes de Cloudinary responden correctamente y se inspeccionaron visualmente.
- 33 pruebas de Vitest aprobadas, incluyendo precios de la carta, IDs conservados, repetición sin duplicados, equivalencias de nombres, productos agotados que no se reactivan y detención ante duplicados ambiguos.
- Consulta del backend real con clave pública y compilación de producción aprobadas.
- La revisión remota confirmó siete URLs nuevas, los precios indicados, categoría `pollos`, ausencia de nombres duplicados y los catorce productos ajenos intactos.

Para revisar localmente, abrir `/catalogo?categoria=pollos`. Las ofertas se distinguen del pollo entero sin bebida. La lista y el detalle muestran la misma descripción, imagen, precio y disponibilidad persistidos. Los precios de pedidos ya registrados no se reescriben: la actualización corresponde al catálogo para nuevas compras.

Los commits quedan locales, sin push, para revisión del usuario.
