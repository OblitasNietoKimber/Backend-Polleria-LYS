# Caja y Pagos

Rama `feature/caja-pagos`, creada desde `dev` y actualizada a `6134d0f`, que incorpora Login, Catálogo, Pedidos de Cliente y Meseras. La implementación conserva los contratos de esas ramas: UUID de pedido, `estado`, `destinatario`, `abrir_pedido_salon` y `obtener_mesas_con_pedidos`.

## Comportamiento

| Requisito | Implementación |
| --- | --- |
| Consultar pedidos pendientes | `pagoService` consulta PostgreSQL con páginas de 100 registros, excluye cancelados y cuentas vacías; Caja muestra la solicitud de cuenta. |
| Registrar el cobro en el servidor | `registrar_cobro` valida sesión, rol Caja/Admin, método, importe y total vigente. |
| Calcular el vuelto | El servidor calcula recibido menos total en efectivo; los otros métodos exigen importe exacto. |
| Evitar cobros duplicados | Un pago por pedido, clave UUID de idempotencia y bloqueo de filas; un reintento idéntico recupera el comprobante guardado. |
| Liberar la mesa | En salón, pago, cierre auditado del pedido y liberación ocurren en la misma transacción. Recojo y delivery conservan su estado operativo. |
| Mostrar el comprobante | Instantánea de productos, precios, envío, total, método, recibido, vuelto, operación, fecha y responsable. Puede recuperarse después de recargar. |
| Sustituir el cobro local | Caja y el resumen de ventas usan InsForge; no consultan ni modifican `lys_pedidos` para cobrar. |

Los métodos Efectivo, Yape, Plin y Tarjeta se registran por separado. Yape, Plin y Tarjeta son registros manuales del cajero; esta entrega no conecta una pasarela bancaria.

## Archivos para revisar

- `Front-Polleria-LYS-main/src/services/pagoService.js`: consultas, normalización de importes/comprobantes y llamada a la RPC.
- `Front-Polleria-LYS-main/src/pages/CajaPage.jsx`: carga, errores, cobro, reintentos con la misma solicitud y recuperación de comprobantes.
- Componentes `FormularioPago`, `ListaPedidos`, `DetalleVenta` y `TicketModal`: métodos, UUID, cuenta solicitada, envío y comprobante.
- `cajaService`, `DashboardAdminPage` e `HistorialVentas`: informes a partir de ventas persistidas.
- `MesaDetalleModal` y `mesaService`: comanda persistida, cierre desde Caja y propagación de errores al intentar liberar una mesa.

La actualización automática consulta una fecha y el conteo de pedidos cada diez segundos. Descarga los registros completos cuando cambia ese sello, y se pausa con la pestaña oculta. Los artículos actualizan el subtotal en PostgreSQL y, con ello, el sello. Las listas especifican columnas y paginan las consultas.

## Base de datos y despliegue

Proyecto: **Backend-Polleria-LYS**, ID `7783e71f-8c16-4fd9-a2e6-24869bf1ec9f`, URL `https://b9zz47j5.us-east.insforge.app`.

La configuración local se obtiene con el script existente `node scripts/configure-insforge-env.mjs` después de vincular el repositorio con InsForge CLI. Solo utiliza la clave pública en el frontend. `.env.local` y `.insforge/` están excluidos de Git.

Las migraciones originales `insforge/migrations/001` a `012` mantienen su contenido. La actualización de Caja está en **`migrations/20261016194047_caja-pagos.sql`**, creada y aplicada mediante el gestor oficial:

```bash
npx -y @insforge/cli db migrations list --json
npx -y @insforge/cli db migrations up 20261016194047 --json
```

El script anterior del equipo `scripts/apply-migrations.mjs` sigue gestionando las migraciones iniciales de `insforge/migrations/`. La migración de Caja se gestiona con los comandos oficiales anteriores, desde la raíz del repositorio. En un backend vacío deben aplicarse primero las migraciones iniciales hasta la 012.

InsForge ejecuta el archivo completo de Caja en una transacción. Primero valida su dependencia de Meseras y las cuentas anteriores, y bloquea las tablas durante la actualización. Si detecta pagos duplicados, importes incompatibles o mesas entregadas sin pago, aborta y requiere conciliación; no cancela ni altera pedidos automáticamente.

No se crean tablas de negocio. Se añaden `estado_pago` y `actualizado_en` a `pedidos`, y `recibido`, `vuelto`, `idempotencia` y `comprobante` a `pagos`. Se incorporan la función de cobro y protecciones para impedir cambiar productos o importes de cuentas cobradas, cerrar una atención sin pago o liberar una mesa con saldo pendiente. Se conservan los privilegios y las políticas de lectura del equipo; las escrituras directas en `pagos` quedan bloqueadas.

Los pagos históricos válidos se conservan. Para esos registros se usa recibido igual al importe y vuelto cero porque el sistema anterior no guardaba esos datos; no se fabrica un comprobante histórico.

### Resultado en el backend indicado

Aplicación confirmada el **16 de octubre de 2026**, a las **14:47 PET**, versión `20261016194047`. Se verificaron los checksums de las doce migraciones previas antes de aplicar Caja. Los dos pedidos, tres detalles, cuatro entradas de historial y el total de S/ 128.10 permanecen iguales; siguen existiendo cero pagos. No se cobraron ni cancelaron los pedidos existentes.

Verificación posterior: seis columnas nuevas, cuatro triggers, dos restricciones únicas, función con `SECURITY DEFINER`, ejecución concedida a `authenticated`, ejecución denegada a `anon`, RLS en pagos y bloqueo de INSERT/UPDATE/DELETE directos. La API real también rechaza la lectura de pagos y la RPC con cliente anónimo.

## Contrato del cobro

```js
await pagoService.registrarCobro(pedido.id, {
  metodo: 'Efectivo',
  monto: 50,
  idempotencia: crypto.randomUUID(),
  totalEsperado: pedido.total,
  referencia: null,
});
```

El servicio llama a `registrar_cobro(p_pedido_id, p_metodo, p_recibido, p_idempotencia, p_total_esperado, p_referencia)`. El total esperado detecta una comanda que cambió mientras se revisaba. El total cobrado procede del pedido almacenado, y el vuelto procede del servidor. Una respuesta perdida debe reintentarse con los mismos argumentos y UUID. La pantalla conserva esa solicitud mientras permanece abierta; si se recarga, primero se debe actualizar y revisar el resultado. La restricción de pago único también protege frente a una nueva solicitud sobre una cuenta ya cobrada.

## Validación

```bash
cd Front-Polleria-LYS-main
npm ci
npm test
npm run build
npm run test:e2e
npm run test:caja-read
```

- 143 pruebas unitarias y de PostgreSQL local correctas. Incluyen los contratos anteriores de Cliente y Meseras con la nueva migración, conservación de pagos históricos y reversión completa ante un fallo posterior al registro del pago.
- Las 41 pruebas de navegador existentes más Caja pasaron; tras ampliar la cobertura de Caja, sus 12 casos pasaron, incluidos reintento, comprobante tras recargar, actualización ligera y pantallas de 320/390 píxeles.
- Compilación correcta y lint correcto en los archivos de esta entrega. El lint global mantiene incidencias anteriores de módulos ajenos a esta entrega.
- El navegador utiliza respuestas controladas. La comprobación `test:caja-read` utiliza el backend real y la clave pública, sin modificar datos.
- Falta una prueba manual autenticada con un usuario de Caja o Admin del equipo. No se crearon usuarios, no se cambiaron roles y no se registraron ventas de prueba en el backend compartido.

## Commits

Los mensajes usan `feat`, son atómicos y no incluyen identificadores de gestión de tareas. Las seis primeras etapas construyen una única migración; se debe desplegar el archivo completo del extremo final de la rama.

| # | Mensaje |
| --- | --- |
| 1 | `feat(caja): validar las cuentas anteriores` |
| 2 | `feat(pagos): preparar el esquema de cobros` |
| 3 | `feat(pagos): registrar el cobro en el servidor` |
| 4 | `feat(pagos): proteger los productos cobrados` |
| 5 | `feat(pagos): exigir pago para cerrar la atención` |
| 6 | `feat(mesas): impedir liberar cuentas pendientes` |
| 7 | `feat(caja): consultar pedidos persistidos` |
| 8 | `feat(caja): conectar el servicio de cobro` |
| 9 | `feat(caja): separar los métodos de pago` |
| 10 | `feat(caja): adaptar la lista y el detalle` |
| 11 | `feat(caja): integrar el cobro y la actualización` |
| 12 | `feat(caja): recuperar los comprobantes guardados` |
| 13 | `feat(ventas): consultar el resumen persistido` |
| 14 | `feat(mesas): mostrar la comanda del servidor` |
| 15 | `feat(mesas): confirmar la liberación en el servidor` |
| 16 | `feat(caja): verificar la integridad de los cobros` |
| 17 | `feat(caja): comprobar el flujo en el navegador` |
| 18 | `feat(caja): documentar la configuración y validación` |

La rama se mantiene local hasta recibir el visto bueno para hacer push.
