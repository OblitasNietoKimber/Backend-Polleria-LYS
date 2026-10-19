# Catálogo de productos

Repositorio: `Backend-Polleria-LYS`. Rama local: `feature/catalogo-productos`.
Base: `6fd5ab0` de `origin/dev`, que ya incorpora EPIC 1.

Se trasladaron los trece cambios del catálogo del repositorio `Backend-Polleria`, adaptados a los servicios, migraciones y pruebas de este repositorio. Los mensajes usan los prefijos `feat(catalogo)`, `test(catalogo)` y `docs(catalogo)`. Esos trece commits y los tres que corrigen el proyecto InsForge ya se subieron a GitHub. Las migraciones 007 y 008 ya están aplicadas en Backend-Polleria-LYS. La corrección posterior del ejecutor de migraciones y esta actualización documental se mantienen locales, sin push.

## Funcionamiento

`/catalogo` obtiene categorías, productos y detalles desde PostgreSQL mediante el cliente compartido de InsForge. Muestra nombre, descripción, imagen, precio y disponibilidad. No usa el catálogo estático como reemplazo si ocurre un error.

La búsqueda consulta `nombre` mediante `ILIKE`, sin distinguir mayúsculas y escapando los comodines `%`, `_` y `\`. El filtro por `categoria_id` se combina con la búsqueda en el servidor. Las consultas recuperan todos los resultados en lotes de cien filas ordenadas por ID. La búsqueda espera 250 ms y las respuestas anteriores se descartan al cambiar los parámetros.

Los parámetros URL son `buscar`, `categoria` y `producto`; por ejemplo, `/catalogo?categoria=pollos&buscar=pollo` o `/catalogo?producto=1`. La pantalla diferencia carga, error con reintento, resultados vacíos y producto retirado.

El carrito recupera los productos persistidos por ID y sus precios actuales. Los productos agotados no se pueden agregar. La confirmación se bloquea si hay errores, carga pendiente, productos retirados o agotados. Se conserva la creación de pedidos de EPIC 1, con precios del servidor, UUID e idempotencia.

## Servicios y permisos

`src/services/productService.js` exporta:

| Método | Función |
|---|---|
| `getCategories()` | Leer categorías |
| `getProducts({ search, category })` | Leer productos; búsqueda vacía y categoría `todos` por defecto |
| `getProduct(id)` | Leer detalle; `null` si no existe |
| `createProduct(product)` | Crear como Administrador con ID generado en PostgreSQL |
| `updateProduct(id, product)` | Editar únicamente el producto indicado como Administrador |

La creación y edición reciben campos completos: `name`, `category` y `price` son obligatorios; `desc` puede omitirse, `image` admite URL HTTP/HTTPS o `null`, y `available` es booleano con valor predeterminado `true`. No se escriben campos extra como ID o rol. Un identificador inválido se rechaza antes de consultar; un producto inexistente no se actualiza.

La autorización consulta la sesión y `public.perfiles.rol`; no confía en metadata editable. PostgreSQL también aplica RLS. Cliente, Mesera, Cocina, Caja y visitantes no pueden crear ni editar productos, incluso si omiten el servicio React y acceden directamente a la base de datos. El usuario tampoco puede cambiar su propio rol.

Se incluyen los servicios de creación y edición; no se añade una pantalla administrativa nueva. Se conserva la configuración y autenticación de EPIC 1.

## Adaptaciones de las migraciones

Las migraciones anteriores se mantienen intactas. Se añaden:

- `007_catalogo_disponibilidad.sql`: permite consultar productos agotados para mostrar su disponibilidad. Los permisos de escritura siguen restringidos al Administrador.
- `008_productos_identidad.sql`: convierte el ID existente en identidad si aún no lo es, conserva los IDs actuales y sitúa la secuencia después del máximo existente. Da uso de la secuencia al rol autenticado; RLS sigue controlando la inserción. Si ya existe identidad, no la recrea ni reinicia la secuencia.

**Las migraciones 007 y 008 se aplicaron en Backend-Polleria-LYS el 13 de octubre de 2026**, después de la autorización explícita del usuario. Ambas están registradas en `public.schema_migrations` con la firma SHA-256 del contenido versionado. Para otro entorno, usar `node scripts/apply-migrations.mjs` siguiendo el README. Subir código a GitHub no aplica migraciones automáticamente.

La configuración local ahora usa **Backend-Polleria-LYS**, con URL `https://b9zz47j5.us-east.insforge.app` e ID `7783e71f-8c16-4fd9-a2e6-24869bf1ec9f`. `.env.local` contiene su clave anónima pública obtenida mediante la CLI. El archivo administrativo `.insforge/project.json` vincula exclusivamente este repositorio al nuevo proyecto y está ignorado. La clave administrativa no se incluye en el frontend ni en Git.

`scripts/configure-insforge-env.mjs` genera el entorno local después de comprobar el ID y la URL del proyecto vinculado. La aplicación rechaza la antigua URL `mpy5z5dn` y las claves administrativas en variables públicas. Las cuentas, sesiones, roles y pedidos de Backend-LYS no se migran automáticamente: pertenecen a otro proyecto.

La inspección real confirmó las ocho migraciones registradas, la política `productos_publicos` con `USING (true)`, el ID con identidad `BY DEFAULT`, el permiso de uso de secuencia para `authenticated` y la política de escritura limitada a `admin`. Se compararon todos los campos de los 17 productos antes y después: ningún producto cambió. La secuencia quedó en 17, lista para generar IDs posteriores. No se crearon usuarios ni se insertaron productos de prueba en el backend.

El ejecutor normaliza CRLF a LF para que Windows y Linux calculen las mismas firmas, comprueba todas las migraciones aplicadas antes de enviar pendientes y verifica el registro después de cada aplicación. La migración y su registro se envían en la misma transacción administrada por InsForge. Una segunda ejecución reconoció las ocho migraciones y no las volvió a aplicar.

## Commits y tareas

Todos los cambios contribuyen a la historia SCRUM-261; los identificadores aparecen en esta documentación y no en los mensajes de commit.

| Orden | Mensaje | Tarea |
|---|---|---|
| 1 | feat(catalogo): consultar las categorías desde PostgreSQL | SCRUM-262 |
| 2 | feat(catalogo): consultar los campos completos de los productos | SCRUM-262, SCRUM-263 |
| 3 | feat(catalogo): consultar un producto por su identificador | SCRUM-263 |
| 4 | feat(catalogo): mostrar las categorías persistidas en el catálogo | SCRUM-262 |
| 5 | feat(catalogo): mostrar los productos persistidos en el catálogo | SCRUM-263 |
| 6 | feat(catalogo): conectar el detalle del producto a PostgreSQL | SCRUM-263 |
| 7 | feat(catalogo): buscar productos por nombre en PostgreSQL | SCRUM-264 |
| 8 | feat(catalogo): filtrar los productos por categoría en PostgreSQL | SCRUM-264 |
| 9 | feat(catalogo): mostrar estados de carga error y catálogo vacío | SCRUM-261, SCRUM-263, SCRUM-264 |
| 10 | feat(catalogo): implementar la creación de productos para el Administrador | SCRUM-265 |
| 11 | feat(catalogo): implementar la edición de productos para el Administrador | SCRUM-265 |
| 12 | test(catalogo): verificar los permisos de escritura del catálogo | SCRUM-265 |
| 13 | docs(catalogo): documentar el funcionamiento y las pruebas del catálogo | SCRUM-261 a SCRUM-265 |

## Validación y revisión

Los commits adicionales son atómicos:

| Mensaje | Alcance |
|---|---|
| fix(insforge): vincular la aplicación a Backend-Polleria-LYS | Identidad del proyecto, validación de URL, configuración local reproducible y exclusión de credenciales |
| test(insforge): verificar la conexión al proyecto correcto | Rechazo de configuración anterior y prueba real de catálogo con solo lecturas |
| docs(insforge): documentar el cambio de proyecto y las migraciones pendientes | Instrucciones, resultados y límites de la configuración nueva |

Después de aplicar las migraciones se añadieron localmente `fix(migrations): conservar las firmas SQL entre Windows y Linux` y `docs(insforge): registrar la aplicación de las migraciones del catálogo`.

Desde `Front-Polleria-LYS-main`:

```bash
npm ci
npm test
npm run test:catalog-read
npm run test:e2e
npm run build
npm run lint
npm run dev
```

Resultados: **28 pruebas de Vitest aprobadas**, **18 de Playwright aprobadas** y **compilación aprobada**. Vitest comprueba consultas, campos, lotes, detalle, filtros, validación, proyecto correcto y permisos en PostgreSQL local con PGlite. Aplica las ocho migraciones de este repositorio, incluida la compatibilidad de identidad con IDs existentes. Playwright incluye las once pruebas de autenticación existentes y las siete del catálogo; simula respuestas de InsForge sin crear cuentas ni enviar correos. Se ejecutó con Microsoft Edge mediante `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

`npm run test:catalog-read` también pasó contra **Backend-Polleria-LYS real** después de aplicar las migraciones, usando únicamente su clave pública: verifica categorías, campos del producto, detalle por ID y búsqueda combinada con categoría. Solo hace lecturas; no crea usuarios, no cambia permisos y no inserta ni modifica productos. La inspección administrativa confirmó la política pública, la identidad y los permisos de secuencia. La creación y las denegaciones por rol se prueban con PGlite; no se realizó una creación de prueba en el backend remoto.

Lint conserva **siete errores y una advertencia preexistentes**, verificados también sobre `origin/dev`. La compilación muestra avisos sobre tamaño del paquete y `crypto` del SDK. La prueba `test:security` del repositorio, que escribe en el backend real, no se ejecutó durante este traslado local.

Para revisar manualmente, abrir `/catalogo`, combinar búsqueda y categoría, abrir un detalle, agregar un producto disponible y recargar el carrito. Comprobar un producto agotado y una búsqueda sin resultados. Las escrituras deben revisarse con cuentas reales que tengan roles asignados en `perfiles`, después de comprobar que el entorno tiene las migraciones necesarias.

Desde la raíz, revisar los trece commits y sus cambios:

```bash
git log --reverse --oneline 6fd5ab0..feature/catalogo-productos
git diff 6fd5ab0..feature/catalogo-productos
```
