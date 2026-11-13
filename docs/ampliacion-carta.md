# Ampliación de la carta

Rama `feature/catalogo-productos`. Proyecto InsForge **Backend-Polleria-LYS**.

Se revisaron las 106 imágenes suministradas y los precios de las páginas 2, 3 y 5 a 12 de la carta PDF del usuario. No se incorporaron platos de pescados y mariscos de la página 4 porque no forman parte de esta entrega de imágenes.

## Organización y precios

Las migraciones 020 a 034 crean nueve categorías y actualizan cada sección por separado. El catálogo conserva las cuatro categorías originales y tiene trece en total: Pollos a la Leña, Parrillas, Entradas, Bebidas, Broaster, Mostros, Chifa, Criollos típicos, Alitas, Selváticos, Especialidades, Sopas y caldos y Guarniciones.

| Grupo de imágenes | Cantidad | Página de precios | Categoría |
|---|---:|---:|---|
| Broaster y salchipapas | 8 | 2 | Broaster |
| Mostros | 5 | 2 | Mostros |
| Chifa | 13 | 3 | Chifa |
| Parrillas mixtas | 3 | 5 | Parrillas |
| Mixtos | 3 | 6 | Parrillas |
| Parrillas personales | 8 | 6 | Parrillas |
| Anticuchos y brochetas | 7 | 6 | Parrillas |
| Criollos típicos | 4 | 7 | Criollos típicos |
| Alitas | 8 | 8 | Alitas |
| Selváticos | 7 | 9 | Selváticos |
| Especialidades | 13 | 10 | Especialidades |
| Sopas y caldos | 10 | 11 | Sopas y caldos |
| Bebidas | 13 | 12 | Bebidas |
| Guarniciones | 4 | 12 | Guarniciones |

Los nombres de archivo y los prefijos de Cloudinary corresponden a los indicados por el usuario. Las descripciones se redactaron después de inspeccionar las imágenes, usando las cantidades de pollo y los componentes de combos indicados en la carta. No se inventaron pesos, marcas ni cantidades de alitas. Para Trío se evita resolver la contradicción del PDF, que menciona dos sabores bajo ese nombre: se describe como combinación de alitas con papas.

## Registros existentes

Se conservan los IDs y la disponibilidad de productos actualizados. Anticuchos (ID 7), alitas BBQ (5), chicha (17), papas (8), ensalada (9) y arroz chaufa (10) se reutilizan por sus nombres anteriores. Las alitas picantes existentes (6) se organizan en Alitas sin sustituir su receta ni su imagen por buffalo. La pechuga a la brasa existente se conserva: no es la misma preparación que pechuga a la parrilla.

Las guarniciones de papas, ensalada y chaufa se reutilizan con las porciones y precios de la nueva carta. Los registros históricos de pedidos no se reescriben. Los platos broaster con ensalada y las alitas broaster con papas tienen acompañamientos y precios distintos en el PDF, por lo que se conservan como productos distintos.

Por instrucción expresa del usuario, los IDs 13 a 16 conservan los nombres, fotos y descripciones de Inca Kola y Coca-Cola: únicamente cambia el precio a S/3 para las personales y S/10 para 1.5 L. No se insertan gaseosas genéricas de esos mismos tamaños ni se utilizan sus dos imágenes genéricas. Las nuevas opciones gordita y 1 L sí se incorporan con sus imágenes.

Las migraciones detectan coincidencias por nombre, alias o imagen. Reutilizan una coincidencia, insertan si no existe y detienen la sección si encuentran más de una coincidencia ambigua. No eliminan productos con referencias de pedidos. Reaplicar las secciones conserva los registros y sus IDs sin añadir duplicados.

## Aplicación y validación

Las migraciones 020 a 034 ya se aplicaron con el ejecutor versionado, verificando el proyecto vinculado. Las migraciones anteriores se conservaron. Se añadieron **98 registros**. El backend real tenía **22 productos** antes de la ampliación, incluido un registro `Test` ajeno a esta tarea; se conservó y ahora tiene **120 productos**. Con los datos iniciales versionados, las pruebas esperan 119. Hay trece categorías en ambos casos.

- 49 pruebas de Vitest aprobadas, incluidas las catorce secciones, conservación de IDs y gaseosas, precios e idempotencia.
- Las 106 imágenes responden correctamente y se inspeccionaron en hojas visuales por sección.
- Verificación de cada precio, imagen y categoría contra el backend real; los IDs existentes siguen presentes y no se detectaron nombres duplicados.
- Consulta con clave pública y compilación de producción aprobadas.
- El catálogo mantiene la consulta por lotes de cien filas; los productos posteriores a las primeras cien filas también se recuperan.

No hace falta añadir tarjetas de producto en React: `/catalogo` obtiene categorías y productos desde PostgreSQL. Las categorías nuevas usan el icono de respaldo que ya existe en la página. No se amplió el arreglo estático de categorías de la portada porque eso modificaría sus secciones; el menú es independiente y sí muestra las trece categorías persistidas. Las simulaciones de otros módulos tampoco se modifican.

Cada sección tiene un commit independiente de datos, además de los commits de categorías, pruebas y documentación. No se hace push; las modificaciones remotas de InsForge son independientes de GitHub y ya afectan al menú conectado a ese backend.
