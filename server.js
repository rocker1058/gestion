import express from 'express';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// ===== Cifrado de credenciales sensibles =====
// La clave se guarda en data/secret.key (generada una vez). No se versiona.
const KEY_PATH = path.join(__dirname, 'data', 'secret.key');
fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
let ENC_KEY;
if (fs.existsSync(KEY_PATH)) {
  ENC_KEY = fs.readFileSync(KEY_PATH);
} else {
  ENC_KEY = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, ENC_KEY, { mode: 0o600 });
}
function encrypt(text) {
  if (text == null || text === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(blob) {
  if (!blob || !String(blob).startsWith('enc:')) return blob || '';
  try {
    const raw = Buffer.from(String(blob).slice(4), 'base64');
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return ''; }
}

// ===== Base de datos =====
const db = new Database(path.join(__dirname, 'data', 'pautas.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer'
  );
  CREATE TABLE IF NOT EXISTS pautas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT, cliente TEXT, plataforma TEXT, tipo TEXT,
    estado TEXT, valor INTEGER, link TEXT,
    seguimiento TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cuentas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT, plataforma TEXT, url TEXT, correo TEXT,
    password TEXT, passCorreo TEXT, fa2 TEXT, notas TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS otros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT, concepto TEXT, red TEXT, duracion TEXT,
    cantidad TEXT, valor INTEGER, estado TEXT, nota TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER, expires_at TEXT
  );
`);

// Migración: columnas para correo de recuperación (seguro si ya existen).
try { db.exec("ALTER TABLE cuentas ADD COLUMN correoRecup TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE cuentas ADD COLUMN passRecup TEXT"); } catch (e) {}

const uCount = db.prepare('SELECT COUNT(*) c FROM users').get();
if (uCount.c === 0) {
  const seed = [
    ['morgan', 'Travel.2020*', 'admin'],
    ['salome', 'Cuentas2020*', 'editor'],
    ['temporal', 'Temporal2020*', 'viewer'],
  ];
  const ins = db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)');
  seed.forEach(([u, p, r]) => ins.run(u, bcrypt.hashSync(p, 10), r));
  console.log('Usuarios iniciales creados: morgan (admin), salome (editor), temporal (viewer)');
}

// ===== Auth helpers =====
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}
function validSession(token) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token=? AND expires_at>datetime('now')").get(token);
  if (!s) return null;
  return db.prepare('SELECT id,username,role FROM users WHERE id=?').get(s.user_id) || null;
}
function requireAuth(req, res, next) {
  const u = validSession(req.cookies.session);
  if (!u) return res.status(401).json({ error: 'No autorizado' });
  req.user = u;
  next();
}
// Permite solo ciertos roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    next();
  };
}

// ===== App =====
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = createSession(user.id);
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.session || '');
  res.clearCookie('session');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const u = validSession(req.cookies.session);
  res.json({ auth: !!u, user: u ? { username: u.username, role: u.role } : null });
});

// ===== Gestión de usuarios (solo admin) =====
app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT id,username,role FROM users ORDER BY id').all());
});
app.post('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(400).json({ error: 'Ese usuario ya existe' });
  db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(username, bcrypt.hashSync(password, 10), role);
  res.json({ ok: true });
});
app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (target && target.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get();
    if (admins.c <= 1) return res.status(400).json({ error: 'No puedes borrar el único admin' });
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Pautas =====
app.get('/api/pautas', requireAuth, requireRole('admin', 'viewer'), (req, res) => {
  const rows = db.prepare('SELECT * FROM pautas ORDER BY id DESC').all();
  rows.forEach(r => r.seguimiento = JSON.parse(r.seguimiento || '[]'));
  res.json(rows);
});
app.post('/api/pautas', requireAuth, requireRole('admin'), (req, res) => {
  const p = req.body;
  const info = db.prepare(`INSERT INTO pautas (fecha,cliente,plataforma,tipo,estado,valor,link,seguimiento)
    VALUES (?,?,?,?,?,?,?,?)`).run(p.fecha, p.cliente, p.plataforma, p.tipo, p.estado, p.valor || 0, p.link || '', JSON.stringify(p.seguimiento || []));
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/pautas/:id', requireAuth, requireRole('admin'), (req, res) => {
  const p = req.body;
  const cur = db.prepare('SELECT * FROM pautas WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Pauta no encontrada' });
  // Si solo viene seguimiento, actualiza solo las notas (compatibilidad con el modal de notas).
  const soloNotas = Object.keys(p).length === 1 && 'seguimiento' in p;
  if (soloNotas) {
    db.prepare(`UPDATE pautas SET seguimiento=? WHERE id=?`).run(JSON.stringify(p.seguimiento || []), req.params.id);
    return res.json({ ok: true });
  }
  // Edición completa: usa el valor nuevo si viene, si no conserva el actual.
  const v = (k, def) => (p[k] !== undefined ? p[k] : def);
  db.prepare(`UPDATE pautas SET fecha=?, cliente=?, plataforma=?, tipo=?, estado=?, valor=?, link=?, seguimiento=? WHERE id=?`).run(
    v('fecha', cur.fecha), v('cliente', cur.cliente), v('plataforma', cur.plataforma),
    v('tipo', cur.tipo), v('estado', cur.estado), v('valor', cur.valor), v('link', cur.link),
    p.seguimiento !== undefined ? JSON.stringify(p.seguimiento) : cur.seguimiento,
    req.params.id
  );
  res.json({ ok: true });
});
app.delete('/api/pautas/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM pautas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Otros (gastos extra: lives, viewers, etc.) =====
app.get('/api/otros', requireAuth, requireRole('admin', 'viewer'), (req, res) => {
  res.json(db.prepare('SELECT * FROM otros ORDER BY id DESC').all());
});
app.post('/api/otros', requireAuth, requireRole('admin'), (req, res) => {
  const o = req.body;
  const info = db.prepare(`INSERT INTO otros (fecha,concepto,red,duracion,cantidad,valor,estado,nota)
    VALUES (?,?,?,?,?,?,?,?)`).run(o.fecha, o.concepto, o.red || '', o.duracion || '',
    o.cantidad || '', o.valor || 0, o.estado || 'pagado', o.nota || '');
  res.json({ id: info.lastInsertRowid });
});
app.put('/api/otros/:id', requireAuth, requireRole('admin'), (req, res) => {
  const o = req.body;
  const cur = db.prepare('SELECT * FROM otros WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Registro no encontrado' });
  const v = (k, def) => (o[k] !== undefined ? o[k] : def);
  db.prepare(`UPDATE otros SET fecha=?, concepto=?, red=?, duracion=?, cantidad=?, valor=?, estado=?, nota=? WHERE id=?`).run(
    v('fecha', cur.fecha), v('concepto', cur.concepto), v('red', cur.red), v('duracion', cur.duracion),
    v('cantidad', cur.cantidad), v('valor', cur.valor), v('estado', cur.estado), v('nota', cur.nota),
    req.params.id
  );
  res.json({ ok: true });
});
app.delete('/api/otros/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM otros WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ===== Cuentas (con cifrado de campos sensibles) =====
const SECRET_FIELDS = ['password', 'passCorreo', 'fa2', 'passRecup'];
function outCuenta(r, canSeeSecrets) {
  const o = { ...r };
  SECRET_FIELDS.forEach(f => o[f] = canSeeSecrets ? decrypt(r[f]) : '');
  return o;
}
app.get('/api/cuentas', requireAuth, (req, res) => {
  const canSee = req.user.role === 'admin' || req.user.role === 'editor';
  const rows = db.prepare('SELECT * FROM cuentas ORDER BY plataforma, nombre').all();
  res.json(rows.map(r => outCuenta(r, canSee)));
});
app.post('/api/cuentas', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const c = req.body;
  const info = db.prepare(`INSERT INTO cuentas (nombre,plataforma,url,correo,password,passCorreo,fa2,notas)
    VALUES (?,?,?,?,?,?,?,?)`).run(c.nombre, c.plataforma, c.url || '', c.correo || '',
    encrypt(c.password), encrypt(c.passCorreo), encrypt(c.fa2), c.notas || '');
  res.json({ id: info.lastInsertRowid });
});
app.post('/api/cuentas/bulk', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const list = req.body.cuentas || [];
  let nuevas = 0, dup = 0, actualizadas = 0;
  const ins = db.prepare(`INSERT INTO cuentas (nombre,plataforma,url,correo,password,passCorreo,fa2,notas,correoRecup,passRecup)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const getExist = db.prepare('SELECT * FROM cuentas WHERE lower(nombre)=lower(?) AND plataforma=?');
  const upd = db.prepare(`UPDATE cuentas SET url=?, correo=?, password=?, passCorreo=?, fa2=?, notas=?, correoRecup=?, passRecup=? WHERE id=?`);
  const tx = db.transaction(() => {
    for (const c of list) {
      if (!c.nombre) continue;
      const ex = getExist.get(c.nombre, c.plataforma);
      if (ex) {
        // La cuenta ya existe: actualizamos solo los campos que vengan con dato
        // en el archivo (así se corrigen las contraseñas mal cargadas) y preservamos
        // lo que ya había (p.ej. notas) cuando el archivo no lo trae.
        const val = v => (v == null ? '' : String(v).trim());
        const nv = {
          url:        val(c.url)        || ex.url || '',
          correo:     val(c.correo)     || ex.correo || '',
          notas:      val(c.notas)      || ex.notas || '',
          correoRecup:val(c.correoRecup)|| ex.correoRecup || '',
          // Campos cifrados: si viene valor nuevo lo re-ciframos; si no, conservamos el cifrado anterior.
          password:   val(c.password)   ? encrypt(c.password)   : ex.password,
          passCorreo: val(c.passCorreo) ? encrypt(c.passCorreo) : ex.passCorreo,
          fa2:        val(c.fa2)         ? encrypt(c.fa2)         : ex.fa2,
          passRecup:  val(c.passRecup)   ? encrypt(c.passRecup)   : ex.passRecup
        };
        // ¿cambió algo realmente?
        const cambio = nv.url!==ex.url || nv.correo!==ex.correo || nv.notas!==(ex.notas||'') ||
          nv.correoRecup!==(ex.correoRecup||'') || nv.password!==ex.password ||
          nv.passCorreo!==ex.passCorreo || nv.fa2!==ex.fa2 || nv.passRecup!==(ex.passRecup||'');
        if (cambio) {
          upd.run(nv.url, nv.correo, nv.password, nv.passCorreo, nv.fa2, nv.notas, nv.correoRecup, nv.passRecup, ex.id);
          actualizadas++;
        } else { dup++; }
        continue;
      }
      ins.run(c.nombre, c.plataforma, c.url || '', c.correo || '',
        encrypt(c.password), encrypt(c.passCorreo), encrypt(c.fa2), c.notas || '',
        c.correoRecup || '', encrypt(c.passRecup));
      nuevas++;
    }
  });
  tx();
  res.json({ nuevas, dup, actualizadas });
});
app.put('/api/cuentas/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const c = req.body;
  const cur = db.prepare('SELECT * FROM cuentas WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Cuenta no encontrada' });
  // Campos no sensibles: usa el nuevo si viene, si no conserva el actual.
  const v = (k, def) => (c[k] !== undefined ? c[k] : def);
  // Campos sensibles: solo se cambian si llega un valor NO vacío; si viene vacío/ausente se conserva el actual cifrado.
  const sec = (k) => (c[k] !== undefined && c[k] !== '' ? encrypt(c[k]) : cur[k]);
  db.prepare(`UPDATE cuentas SET nombre=?, plataforma=?, url=?, correo=?, password=?, passCorreo=?, fa2=?, notas=? WHERE id=?`).run(
    v('nombre', cur.nombre), v('plataforma', cur.plataforma), v('url', cur.url), v('correo', cur.correo),
    sec('password'), sec('passCorreo'), sec('fa2'), v('notas', cur.notas),
    req.params.id
  );
  res.json({ ok: true });
});
app.delete('/api/cuentas/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM cuentas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Estáticos
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Pautas y Gestión corriendo en puerto ${PORT}`));
