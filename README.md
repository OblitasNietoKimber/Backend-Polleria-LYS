# Backend Pollería Leñas y Sabores

Frontend React + Vite en `Front-Polleria-LYS-main/` y PostgreSQL/Auth administrados por InsForge.

El proyecto de este repositorio es **Backend-Polleria-LYS**, con URL `https://b9zz47j5.us-east.insforge.app` e ID `7783e71f-8c16-4fd9-a2e6-24869bf1ec9f`. La aplicación rechaza la URL del proyecto anterior Backend-LYS.

## Desarrollo

1. Dentro de `Front-Polleria-LYS-main`, ejecuta `npm ci`.
2. Copia `.env.example` a `.env.local` y completa `VITE_INSFORGE_ANON_KEY` con la clave **pública** de InsForge (Dashboard → Install → API Keys).
3. Ejecuta `npm run dev`. Los redirects configurados por defecto usan `http://localhost:5173`.

Para generar `.env.local` con la clave pública del proyecto correcto, autentícate en InsForge CLI y ejecuta desde la raíz:

```bash
npx -y @insforge/cli link --project-id 7783e71f-8c16-4fd9-a2e6-24869bf1ec9f --org-id 331d8014-42c9-4764-bd3c-5a4724ea279a --json --yes
node scripts/configure-insforge-env.mjs
```

El script comprueba el ID y URL del proyecto vinculado antes de obtener su clave anónima pública. No imprime claves. `.insforge/project.json` y `.env.local` están excluidos de Git. Reinicia `npm run dev` después de cambiar la configuración. Las sesiones y cuentas del proyecto anterior no se transfieren al nuevo: inicia sesión con una cuenta registrada en Backend-Polleria-LYS.

La API key privada `ik_…` se utiliza exclusivamente para administrar infraestructura. No debe aparecer en archivos versionados ni en variables `VITE_`. Sin configuración, la aplicación muestra un mensaje de configuración y un botón para reintentar.

## Infraestructura

Desde la raíz, define `INSFORGE_BASE_URL`, `INSFORGE_API_KEY` y opcionalmente `APP_URL` en el entorno del administrador. No guardes estos valores en Git.

```bash
node scripts/apply-migrations.mjs
node scripts/configure-auth.mjs
```

Las migraciones se aplican por orden y se registran con SHA-256. El script omite las ya aplicadas y rechaza archivos modificados después de su aplicación. El endpoint de InsForge controla las transacciones; no acepta comandos BEGIN/COMMIT enviados por MCP. La configuración de Auth utiliza `PUT /api/auth/config`, porque modificar `auth.config` por SQL no está permitido.

No se encontró el esquema MySQL original en `dev`. Estas migraciones reconstruyen el modelo a partir del frontend; no representan una conversión validada de un DDL MySQL ausente. No hay migración automática de cuentas locales: esas cuentas eran simuladas y deben registrarse de nuevo.

## Autenticación

- Registro por correo con nombre, apellido y teléfono. La contraseña se entrega a Auth y no se guarda en Web Storage.
- Verificación por código enviado al correo. Los datos personales pendientes se guardan temporalmente en sessionStorage, sin contraseña ni rol, y se copian al perfil tras verificar.
- Login, logout y restauración mediante el SDK y su cookie de refresh httpOnly. La UI espera la sesión y consulta el rol en `public.perfiles`.
- Google OAuth con PKCE y callback `/auth/callback`. Habilita Google en Auth Methods y añade los redirects de la aplicación. La suite del navegador simula al proveedor; se requiere una prueba manual con una cuenta Google real.
- Recuperación por correo: el código recibido se intercambia por un token antes de establecer la contraseña. También se admite un token de enlace válido. No se muestra ningún código de recuperación en pantalla.
- Cambiar contraseña desde el perfil envía un código al correo; la API actual no ofrece un cambio directo mediante contraseña anterior.
- Los cambios de perfil y preferencias esperan la respuesta de PostgreSQL.

La verificación por código conserva los datos de registro si se completa en la misma pestaña. Si se usa otro navegador, se puede completar nombre/apellido/teléfono desde Mi perfil.

## Roles y permisos

| Rol | Rutas privadas |
| --- | --- |
| Cliente | Perfil, pedidos propios y checkout |
| Mesera | Perfil y mesas |
| Cocina | Perfil y cocina |
| Caja | Perfil y caja |
| Administrador | Perfil, mesas, cocina, caja y dashboard |

Cada usuario nuevo recibe `cliente` en el servidor. No se confía en roles de localStorage ni en metadata editable. El perfil permite editar únicamente nombre, apellido, teléfono y preferencias. Asigna roles de personal desde el SQL administrativo, usando el ID correcto del usuario:

```sql
UPDATE public.perfiles SET rol = 'caja' WHERE id = 'UUID_DEL_USUARIO';
```

RLS oculta perfiles/pedidos/detalles/pagos ajenos. Con la migración 007, el catálogo también muestra productos agotados e informa su disponibilidad. El personal puede consultar pedidos; la edición del catálogo queda limitada al administrador. Las operaciones de negocio sobre pagos y estados requieren RPCs validados en sus siguientes épicas y están bloqueadas por escritura directa.

Los pedidos del cliente usan `crear_pedido_cliente`: el servidor determina propietario, estado inicial, precios y envío (S/ 6 delivery, S/ 0 recojo). Las migraciones 009–011 añaden importes y nombres vendidos, historial de estados protegido y reintentos validados por contenido. La aplicación pagina pedidos e historial y conserva la solicitud al recargar tras un fallo. No registra cobros. Las vistas operativas de mesas/cocina/caja/dashboard y la pasarela de tarjeta conservan las simulaciones existentes; su migración completa corresponde a las siguientes épicas. Consulta [pedidos del cliente](docs/pedidos-cliente.md) para contratos, pruebas y migraciones, actualmente verificadas en una rama aislada de InsForge y pendientes de aplicar al proyecto principal.

## Facebook — SCRUM-255

El entorno consultado ofrece Google y GitHub, y no tiene proveedores personalizados. El SDK admite proveedores personalizados configurados mediante descubrimiento OIDC, pero eso no confirma compatibilidad con Facebook. No hay botón Facebook ni una autenticación ficticia. Tarea independiente: confirmar el mecanismo admitido por InsForge/Meta, registrar la aplicación Meta, configurar credenciales exclusivamente en el servidor y probar callback/permisos antes de habilitarlo.

## Validación

Dentro del frontend:

```bash
npm run build
npm test
npm run test:catalog-read
npx playwright install chromium
npm run test:e2e
npm run lint
# Con INSFORGE_BASE_URL, INSFORGE_API_KEY e INSFORGE_ANON_KEY definidos:
npm run test:security
```

La suite E2E cubre registro/verificación, errores de login, restauración/logout, Google, recuperación, edición del perfil y las rutas de los cinco roles. Intercepta respuestas de Auth/DB para no enviar correos ni depender del proveedor. La prueba test:security comprueba RLS, roles, precios e idempotencia contra el backend real, crea usuarios temporales en desarrollo y elimina sus datos en finally. Ninguna prueba verifica la entrega real de emails. InsForge no tiene SMTP propio configurado; comprueba entrega de verificación/recuperación a tu correo antes de usarlo en producción.

Para usar un Chromium ya instalado, define `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Los cambios de esta rama pasan lint por archivos; el lint global conserva errores previos en módulos ajenos a Auth (ver `docs/VALIDACION.md`).

Nada se publica automáticamente. Esta rama se prepara localmente para revisión antes de push o PR.

Consulta [la revisión del catálogo](docs/catalogo-productos.md) para sus trece commits, servicios, migraciones pendientes de aplicar y resultados de las pruebas.

Consulta [Caja y Pagos](docs/caja-pagos.md) para sus 18 commits, contrato de cobro, migración aplicada al nuevo InsForge y resultados de validación.

## Cocina y seguimiento

El panel de cocina consulta PostgreSQL, valida las transiciones en el servidor y sincroniza cocina, mesas, Caja y el seguimiento del cliente mediante canales privados. Las migraciones se verificaron en la rama aislada `panel-cocina` del nuevo InsForge; su aplicación al backend principal y la publicación de Git requieren revisión. Consulta [la implementación de cocina](docs/panel-cocina.md).
