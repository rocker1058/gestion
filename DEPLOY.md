# Guía de despliegue — Gestión y Pautas

Guía para desplegar la app en el servidor de producción desde el repositorio de GitHub.

- **Repo:** `git@github.com:rocker1058/gestion.git`
- **Servidor:** `ubuntu@44.204.216.44` (dominio `pautasygestion.com`)
- **Ruta de la app:** `/home/ubuntu/pautas`
- **Gestor de procesos:** pm2 (proceso `pautas`, puerto `3001`)
- **Proxy:** nginx (HTTPS 443 → 3001)

> ⚠️ **Importante:** la carpeta `data/` (base de datos y `secret.key`) **no está en git** y nunca debe borrarse ni sobrescribirse. La `secret.key` descifra las contraseñas guardadas: si se pierde, no se recuperan.

---

## Conexión al servidor

```bash
ssh -i ~/.ssh/alexandra.pem ubuntu@44.204.216.44
```

---

## Opción A — Despliegue manual rápido (lo que hay hoy)

Los archivos están sueltos en `/home/ubuntu/pautas` (no es un repo git todavía). Para actualizar un archivo puntual desde tu máquina local:

```bash
# Desde tu máquina, en la carpeta del proyecto local
scp -i ~/.ssh/alexandra.pem server.js            ubuntu@44.204.216.44:/home/ubuntu/pautas/server.js
scp -i ~/.ssh/alexandra.pem public/app.js        ubuntu@44.204.216.44:/home/ubuntu/pautas/public/app.js
scp -i ~/.ssh/alexandra.pem public/index.html    ubuntu@44.204.216.44:/home/ubuntu/pautas/public/index.html

# Luego, en el servidor:
ssh -i ~/.ssh/alexandra.pem ubuntu@44.204.216.44
cd /home/ubuntu/pautas
node --check server.js        # validar que no haya errores de sintaxis
pm2 restart pautas            # solo necesario si cambió server.js
```

- Si solo cambiaste archivos de `public/` (frontend), **no hace falta reiniciar** pm2; basta con recargar el navegador (Ctrl+Shift+R).
- Si cambiaste `server.js`, **sí** hay que `pm2 restart pautas`.

---

## Opción B — Despliegue por git (recomendado)

Convierte el servidor en un clon del repo. Así actualizas con `git pull`.

### 1. Preparar el servidor (una sola vez)

```bash
ssh -i ~/.ssh/alexandra.pem ubuntu@44.204.216.44
cd /home/ubuntu/pautas

# Respaldar la carpeta de datos (fuera del árbol de git)
cp -r data ~/pautas-data-backup-$(date +%Y%m%d)

# Inicializar git y enlazar el repo
git init
git remote add origin https://github.com/rocker1058/gestion.git

# Traer el código del repo sin sobrescribir data/ (está en .gitignore)
git fetch origin
git checkout -f main
```

> Si el servidor no tiene acceso SSH a GitHub, usa la URL `https://github.com/...` como arriba.
> Para repos privados por HTTPS necesitarás un token de acceso personal de GitHub.

### 2. Desplegar cambios (cada vez)

```bash
ssh -i ~/.ssh/alexandra.pem ubuntu@44.204.216.44
cd /home/ubuntu/pautas

git pull origin main          # traer últimos cambios
npm install                   # solo si cambió package.json
node --check server.js        # validar sintaxis
pm2 restart pautas            # aplicar cambios del backend
pm2 save                      # persistir estado de pm2
```

### 3. Script de despliegue (opcional)

Crea `/home/ubuntu/pautas/deploy.sh` en el servidor:

```bash
#!/usr/bin/env bash
set -e
cd /home/ubuntu/pautas
echo "→ Trayendo cambios..."
git pull origin main
if git diff --name-only HEAD@{1} HEAD | grep -q package.json; then
  echo "→ package.json cambió, instalando dependencias..."
  npm install
fi
echo "→ Validando sintaxis..."
node --check server.js
echo "→ Reiniciando app..."
pm2 restart pautas
pm2 save
echo "✓ Despliegue completado."
```

Dale permisos y úsalo así:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Flujo de trabajo completo (local → GitHub → servidor)

```bash
# 1. En tu máquina local: hacer cambios y subirlos
cd /home/rocker/pautas-app-server
git add .
git commit -m "describe el cambio"
git push origin main

# 2. En el servidor: desplegar
ssh -i ~/.ssh/alexandra.pem ubuntu@44.204.216.44 "cd /home/ubuntu/pautas && ./deploy.sh"
```

---

## Comandos útiles en el servidor

```bash
pm2 list                      # ver estado de las apps
pm2 logs pautas               # ver logs en vivo
pm2 logs pautas --lines 50    # últimas 50 líneas
pm2 restart pautas            # reiniciar
pm2 stop pautas               # detener
sudo systemctl reload nginx   # recargar proxy
```

---

## Rollback (volver atrás)

Antes de cada cambio importante se dejan backups con fecha. Para volver a una versión anterior de un archivo:

```bash
cd /home/ubuntu/pautas
ls -la *.bak-* public/*.bak-*     # ver backups disponibles
cp server.js.bak-AAAAMMDD-HHMMSS server.js
pm2 restart pautas
```

Con git también puedes volver a un commit anterior:

```bash
git log --oneline                 # ver historial
git checkout <hash> -- server.js  # restaurar un archivo de un commit
pm2 restart pautas
```

---

## Checklist antes de desplegar

- [ ] Probado localmente (`node --check server.js`).
- [ ] Cambios commiteados y pusheados a `main`.
- [ ] Backup de `data/` reciente (si el cambio toca la base de datos).
- [ ] `pm2 restart pautas` tras cambios en `server.js`.
- [ ] Verificado en el navegador con recarga forzada (Ctrl+Shift+R).
