# Pautas y Gestión

Aplicación web para gestión de pautas publicitarias y cuentas de redes sociales
(X/Twitter, Instagram, TikTok, Facebook, YouTube).

## Stack
- Backend: Node.js + Express
- Base de datos: SQLite (`better-sqlite3`)
- Autenticación: usuarios con roles (viewer / editor / admin), contraseñas con `bcryptjs`
- Frontend: HTML + JS estático servido desde `public/`

## Estructura
```
server.js        # Servidor Express + API REST
public/
  index.html     # UI
  app.js         # Lógica del frontend
package.json
```

## Desarrollo local
```bash
npm install
npm start        # arranca en http://localhost:3001
```

## Importación de cuentas (CSV)
La app detecta cuentas desde CSV de dos formas:
1. Por bloques: filas tipo `cuentas instagram`, `cuentas x`, etc.
2. Por encabezado de columnas (detección automática): reconoce columnas
   como `usuario ig`, `url ig`, `contraseña ig`, etc. aunque el CSV no traiga
   la fila de bloque.

La importación **agrega** cuentas nuevas y no sobrescribe las existentes
(compara por nombre + plataforma).

## Datos sensibles
La carpeta `data/` (base de datos y clave de cifrado) **no se versiona**.
Se genera automáticamente al arrancar el servidor.
