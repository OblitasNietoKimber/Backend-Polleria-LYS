# Flujo integrado en las pantallas originales y recuperación

La implementación está integrada en las pantallas originales de **http://localhost:5173** y utiliza el proyecto InsForge existente. Se instaló la migración de atenciones tras crear y verificar un respaldo nativo, exportar el esquema/datos y validar una ejecución con rollback. No se hicieron commits ni push. Se retiraron las cuatro páginas alternativas que cambiaban el diseño.

## Iniciar la prueba

Desde `Backend-Polleria-LYS/Front-Polleria-LYS-main`:

```powershell
npm run dev
```

Abrir **http://localhost:5173/mesas** y recargar con Ctrl+Shift+R. Se conservan los usuarios, contraseñas y datos reales del proyecto. El plano, las tarjetas, el modal de mesa, el editor de comanda, las columnas de cocina, el banner y la distribución de caja son los originales. Los controles nuevos se incorporaron dentro de esos componentes.

Usar perfiles de navegador distintos para mantener sesiones simultáneas de cada rol. Cerrar sesión antes de cambiar de usuario en el mismo perfil. No se usan las cuentas ficticias `@local.test` en localhost:5173.

El puerto 5180 queda únicamente para la batería automática con PostgreSQL/PGlite en memoria. Ejecuta las mismas pantallas originales; ya no existe una interfaz paralela. Sus datos ficticios no se mezclan con InsForge. Los datos persistentes anteriores de la prueba equivocada se archivaron fuera del repositorio.

El flujo está activado mediante `VITE_FLUJO_ATENCIONES=true` en `.env.local`, conservando su URL y clave pública originales. No se añaden claves administrativas al frontend. Desactivar esa variable sin restaurar el backend no constituye una reversión completa: los permisos y operaciones antiguas están protegidos por las reglas nuevas.

## Recorridos que probar

1. **Cuenta al final:** mesera confirma una comanda; cocina comienza, marca listo y entrega. La mesa sigue ocupada. Mesera solicita cuenta y caja cobra. Mesera confirma que los clientes se retiraron y cierra la atención.
2. **Cobro anticipado:** caja encuentra el consumo en Cuentas abiertas y marca la confirmación de cobro anticipado. El cobro no retira los platos de cocina. La mesa sigue ocupada después de entregar hasta su cierre manual.
3. **Cuenta adicional:** después de pagar, mesera abre otra cuenta en la misma atención. Los comprobantes anteriores permanecen intactos. Si quedan platos de ambas cuentas, cocina muestra ambas y el cierre revisa todas.
4. **Ampliación después de entregar:** sin pagar aún, añadir cantidades. Cocina recibe únicamente la diferencia. No se permite retirar cantidades ya entregadas. Los productos existentes conservan nombre y precio vendidos aunque cambie el catálogo.
5. **Cuenta solicitada:** no admite edición hasta reabrirse. Al reabrir se invalida la solicitud. Cobrar desde una pestaña con una versión vieja devuelve un conflicto, incluso si el total coincide.
6. **Anulación temprana:** mesera/caja pueden anular una comanda sin preparar, indicando motivo. No libera automáticamente la mesa.
7. **Anulación durante preparación:** mesera/caja solicitan; administración autoriza o rechaza; cocina confirma la detención cuando corresponde. Mientras está pendiente, la comanda permanece visible con un aviso.
8. **Consumo entregado sin cobrar:** se registra un incidente. Administración autoriza la pérdida; las entregas permanecen en el historial.
9. **Devolución total:** solicitar, autorizar y registrar el dinero realmente devuelto y su referencia. Si quedan platos, cocina debe detenerse antes de registrar la devolución. El pago y comprobante originales se conservan; se cancela el estado operativo y la devolución se registra aparte. No ejecuta transferencias bancarias.
10. **Recojo/delivery:** el cliente puede confirmar pedidos desde el catálogo. Recojo exige pago antes de entregar; delivery en efectivo puede salir pendiente. Caja confirma la entrega final únicamente con cobro registrado.
11. **Reservas:** reservar una mesa libre, cancelar una reserva y sentar clientes en una reservada. No se puede reservar una atención ocupada.
12. **Regresión:** consultar catálogo, perfil, Mis pedidos, seguimiento, productos de administración y dashboard. Un cliente no ve cuentas del personal ni cambia su rol. Los indicadores conservan cobros brutos; el dashboard muestra devoluciones por separado y por fecha real de devolución.

## Datos, permisos y compatibilidad

- `pedidos`, `pagos`, `detalles_pedido`, `entregas_cocina` e historial del cliente conservan sus identificadores y contratos de lectura.
- `atenciones_salon` agrupa las cuentas; no se cuenta como una venta adicional.
- El servidor exige identidad, rol, versión y una operación idempotente. Precios y cantidades se verifican en PostgreSQL.
- Las funciones internas y los registros de operaciones no tienen permisos públicos. Las RPC antiguas no permiten saltarse las reglas nuevas para salón.
- Cada operación bloquea mesa → atención → pedido → incidencia. Las incidencias actualizan el sello del pedido, para que las pantallas existentes detecten cambios.
- La migración está en **`migrations/atenciones/20261116010000_atenciones-salon.sql`**. Está instalada y registrada en `schema_migrations`. Su checksum es `7614b92a0b645c1d35c8d1e069a8ba0d71112cd1f82c90b63c2fc7fc62c12cfe`.
- Caja conserva su consulta de pedidos y carga todas sus páginas, de 100 registros, para mantener completos los filtros y resúmenes existentes. El historial de cocina conserva su pantalla y RPC existentes, con páginas de 50 entregas. El resumen de caja no sustituye el dashboard histórico.
- La migración adicional `20261116011000_atenciones-concurrencia.sql` también está instalada: abrir otra cuenta o cerrar exige el identificador de la atención observada. Una pestaña antigua no puede operar sobre nuevos comensales de la misma mesa.
- No se sustituyen las páginas existentes. Las rutas y servicios de autenticación y pedidos del cliente se conservan.

## Límites explícitos

La batería automática comprueba el flujo y sus permisos con PostgreSQL local; no replica Google, envío real de correo, archivos en la nube ni pagos bancarios. La aplicación de localhost:5173 sigue conectada a InsForge para esas funciones. Las comprobaciones reales de interfaz se realizaron en lectura con las cuentas documentadas: mesas, clic y modal, caja, cocina, perfil y pedidos privados del cliente. No se crearon pedidos ni cobros de prueba en InsForge durante esa verificación.

Las incidencias se solicitan por comanda completa. Antes de comenzar la preparación pueden editarse productos; retirar platos que ya están preparándose requiere resolver la comanda mediante autorización. No se admiten pagos parciales, división entre comensales ni devoluciones parciales.

## Volver al estado anterior

El respaldo **`APF3/respaldo-antes-flujo-atenciones/`** contiene 230 archivos del estado anterior, incluidos cambios que ya estaban sin commit. Tiene manifiesto, HEAD de referencia y hashes SHA-256. No depende de `git reset` ni de crear un commit.

También existe un respaldo **nativo de InsForge** completado: `antes-flujo-integrado-20261115`, ID `be7f453d-9290-446f-b258-17f6ec4e09c7`. La copia adicional está en `APF3/respaldo-insforge-antes-integracion-20261115/`: esquema y datos, metadatos de recuperación, configuración anterior y capturas de la interfaz verificada. La instalación conservó 44 pedidos, 31 pagos y S/ 2.452 cobrados.

Primero detener el servidor local. Desde `Backend-Polleria-LYS`:

```powershell
# Solo comprueba el punto de recuperación; no restaura nada.
node scripts/restaurar-insforge-atenciones.cjs

# Restaura InsForge, espera su disponibilidad y recupera configuración y código.
node scripts/restaurar-insforge-atenciones.cjs --aplicar
```

Si hay pedidos, cobros, detalles o mesas modificados después del respaldo, el script **rechaza la restauración normal**. Restaurar un respaldo nativo reemplaza los datos posteriores; no puede prometer conservar al mismo tiempo cambios que el esquema antiguo no representa. Solo si esos cambios son pruebas que se desea descartar, se puede añadir `--descartar-pruebas`. Antes de restaurar se exportan también los datos actuales. No ejecutar esa opción si hubo operaciones reales que deban conservarse.

Después de que InsForge confirme que está activo, se recuperan `.env.local` y el código anterior, incluidos los cambios que estaban sin commit. Se comprueban los hashes y rutas antes de escribir; no se modifica Git. Si hay modificaciones de código propias posteriores, guardarlas antes. El respaldo afecta al proyecto InsForge completo: también sus datos de usuarios; coordinar la restauración si otras personas están utilizando la aplicación.

## Validación

```powershell
npm test
npx playwright test --config playwright.flujo.config.js
npx playwright test --config playwright.regression.config.js
npm run build
```

Los tests de `tests/flow-e2e` usan el backend PostgreSQL local real y sesiones separadas. La batería anterior de navegador intercepta APIs y comprueba contratos visuales y de integración sin tocar InsForge. Los tests de `tests/atenciones-database.test.js` incluyen permisos, escrituras directas, versiones, reintentos, cuentas adicionales, anulaciones, devoluciones, catálogo y migración de una atención existente.

Resultados de la implementación local:

- 317 pruebas de servicios y PostgreSQL aprobadas, incluidas 19 de atenciones y la protección contra pestañas antiguas al reutilizar una mesa.
- 65 pruebas anteriores de navegador comprobadas: 34 de caja/cocina/catálogo y 31 de reportes, pedidos y autenticación. Se corrigieron expectativas antiguas de códigos completos y redirección de OAuth; el comportamiento de autenticación y seguimiento no se cambió.
- 5 recorridos de navegador nuevos aprobados con el servidor local real: atención completa, permisos y perfil del cliente, cancelación y móvil, checkout/delivery/dashboard y pérdida de respuesta después de un cobro.
- Restauración probada en un repositorio temporal: vista previa sin cambios, recuperación de contenido, retirada de archivos nuevos y conservación de Git y credenciales. Se comprobaron los 230 hashes del respaldo real sin restaurar el proyecto activo.
- Compilación y revisión de estilo de los archivos modificados correctas. Se conservaron los avisos existentes de tamaño del bundle y de `crypto` externalizado por el SDK.

La revisión también conservó la actividad reciente del salón en PostgreSQL y la paginación del historial de ventas. El resumen de devoluciones se añade de manera condicional al modo nuevo, sin reinterpretar ni borrar comprobantes históricos.
