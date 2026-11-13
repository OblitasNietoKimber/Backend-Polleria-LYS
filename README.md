#  Pollería Leñas y Sabores — Backend & Frontend

Sistema web de gestión y pedidos para la Pollería Leñas y Sabores. 
Frontend en **React + Vite** y Backend/Base de Datos en **PostgreSQL administrado por InsForge**.

---

##  Credenciales de Prueba

Utiliza las siguientes cuentas para probar cada uno de los roles y permisos del sistema:

| Rol | Correo Electrónico | Contraseña | Módulos con Acceso |
| :--- | :--- | :--- | :--- |
| **Administrador** | `jacobo31_288@stmng.lat` | `q1234567` | Dashboard, Mesas, Cocina, Caja y Perfil |
| **Caja** | `yaxal97750@ensproxy.com` | `c1234567` | Módulo de Cobros / Caja y Perfil |
| **Cocinero** | `ratenox394@iconcubic.com` | `prueba123` | Panel de Pedidos en Cocina y Perfil |
| **Mesero** | `majimer746@goldlicai.com` | `m1234567` | Toma de Pedidos en Mesas y Perfil |

* **Despliegue en producción:** [https://back-polleria-lys.vercel.app](https://back-polleria-lys.vercel.app)

---

##  Instrucciones para Ejecutar el Proyecto

### 1. Variables de Entorno
Copia el archivo de ejemplo para generar tu archivo de configuración local:

```bash
cp Front-Polleria-LYS-main/.env.example Front-Polleria-LYS-main/.env.local
```

### 2. Instalación y Ejecución
Desde la raíz del repositorio, entra al frontend y levanta el entorno:

```bash
# Entrar a la carpeta del frontend
cd Front-Polleria-LYS-main

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

La aplicación abrirá en: **`http://localhost:5173`**

---

##  Pruebas y Construcción

Dentro de la carpeta `Front-Polleria-LYS-main`, puedes ejecutar:

```bash
# Correr las pruebas unitarias y de integración (Vitest)
npm test

# Compilar bundle de producción
npm run build

# Validar reglas de estilo y código
npm run lint
```
