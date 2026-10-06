# Gestión y Pautas

Aplicación web para gestión de pautas publicitarias y cuentas de redes sociales, con control de acceso por roles.

## Características

- **Autenticación** con sesiones (cookies httpOnly) y contraseñas con bcrypt.
- **Roles de usuario:**
  - `admin`: acceso total (pautas, otros, cuentas, usuarios).
  - `editor`: solo cuentas; puede ver, crear, importar y editar cuentas.
  - `viewer`: solo lectura de pautas y otros.
- **Cuentas** con cifrado AES-256-GCM de campos sensibles (contraseñas, 2FA).
- **Importación** de cuentas desde CSV o pegado desde Excel.

## Requisitos

- Node.js 18+

## Instalación

```bash
npm install
npm start
```

El servidor corre por defecto en el puerto `3001` (configurable con la variable `PORT`).

## Primer arranque

Al iniciar por primera vez se crea la base de datos en `data/pautas.db` y se generan usuarios iniciales. Cambia estas contraseñas en producción.

## Notas de seguridad

- `data/` (base de datos y `secret.key`) **no se versiona**. La clave de cifrado se genera automáticamente en el primer arranque y debe conservarse: sin ella no se pueden descifrar las credenciales guardadas.
- Despliega detrás de un proxy con HTTPS (p. ej. nginx).

## Estructura

```
server.js        # Backend Express + SQLite
public/
  index.html     # Interfaz
  app.js         # Lógica del cliente
package.json
```
