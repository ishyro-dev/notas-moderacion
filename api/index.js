// Notas de Moderación — API (Vercel Serverless Function, sin dependencias).
// Base de datos: Upstash Redis (Vercel Marketplace) vía su API REST.
import { createHash, randomBytes } from 'node:crypto';
import APP from './_app.js';
import { ADMIN_HASH, ADMIN_NOMBRE } from './_admin.js';

const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const P = 'nm:';
const SESION_SEG = 60 * 60 * 24 * 30;   // 30 días
const MAX_NOTAS = 5000;
const ALF = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// ------------------------------------------------------------------ Redis
async function redis(...cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + R_TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}
async function pipe(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(R_URL.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + R_TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await r.json();
  return j.map(x => { if (x.error) throw new Error('Redis: ' + x.error); return x.result; });
}
function hashObj(arr) { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; }
const json = s => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };

// ------------------------------------------------------------------ utilidades
const normalizar = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const hashCodigo = c => createHash('sha256').update('nm:' + normalizar(c)).digest('hex');
function nuevoCodigo() {
  const b = randomBytes(16); let s = '';
  for (let i = 0; i < 16; i++) { s += ALF[b[i] % 32]; if (i % 4 === 3 && i < 15) s += '-'; }
  return s;
}
const nuevoId = () => randomBytes(6).toString('hex');
const hoy = () => new Date().toISOString();
const publico = s => ({ id: s.id, nombre: s.nombre, admin: !!s.admin, creado: s.creado, ultimo: s.ultimo || null, final: s.final || '' });

class Err extends Error { constructor(st, m) { super(m); this.st = st; } }

async function inicializar() {
  // Crea la cuenta de administrador la primera vez (su código solo existe como hash).
  if (await redis('SET', P + 'init', '1', 'NX') === 'OK') {
    const s = { id: 'admin', nombre: ADMIN_NOMBRE, admin: true, hash: ADMIN_HASH, creado: hoy(), final: '' };
    await pipe([['HSET', P + 'staff', s.id, JSON.stringify(s)], ['SET', P + 'codigo:' + ADMIN_HASH, s.id]]);
  }
}

async function usuario(req) {
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!/^[0-9a-f]{64}$/.test(tok)) throw new Err(401, 'Sesión no válida');
  const id = await redis('GET', P + 'ses:' + tok);
  if (!id) throw new Err(401, 'Sesión caducada');
  const s = json(await redis('HGET', P + 'staff', id));
  if (!s) { await redis('DEL', P + 'ses:' + tok); throw new Err(401, 'Acceso revocado'); }
  s.token = tok;
  return s;
}
function soloAdmin(u) { if (!u.admin) throw new Err(403, 'Solo administradores'); }

async function cerrarSesiones(id) {
  const toks = await redis('SMEMBERS', P + 'sesiones:' + id) || [];
  await pipe([...toks.map(t => ['DEL', P + 'ses:' + t]), ['DEL', P + 'sesiones:' + id]]);
}

// ------------------------------------------------------------------ acciones
const acciones = {
  async login(req, b) {
    const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
    const n = await redis('INCR', P + 'intentos:' + ip);
    if (n === 1) await redis('EXPIRE', P + 'intentos:' + ip, 900);
    if (n > 25) throw new Err(429, 'Demasiados intentos. Espera 15 minutos.');
    const h = hashCodigo(b.codigo);
    const id = normalizar(b.codigo).length >= 12 ? await redis('GET', P + 'codigo:' + h) : null;
    const s = id && json(await redis('HGET', P + 'staff', id));
    if (!s || s.hash !== h) throw new Err(401, 'Código no válido');
    const tok = randomBytes(32).toString('hex');
    s.ultimo = hoy();
    await pipe([
      ['SET', P + 'ses:' + tok, s.id, 'EX', SESION_SEG],
      ['SADD', P + 'sesiones:' + s.id, tok],
      ['HSET', P + 'staff', s.id, JSON.stringify(s)],
      ['DEL', P + 'intentos:' + ip],
    ]);
    return { token: tok };
  },

  async inicio(req) {
    const u = await usuario(req);
    const [config, prefs] = await pipe([['GET', P + 'config'], ['GET', P + 'prefs:' + u.id]]);
    return { app: APP, yo: publico(u), config: json(config), prefs: json(prefs) };
  },

  async salir(req) {
    const u = await usuario(req);
    await pipe([['DEL', P + 'ses:' + u.token], ['SREM', P + 'sesiones:' + u.id, u.token]]);
    return { ok: true };
  },

  async prefs(req, b) {
    const u = await usuario(req);
    const t = JSON.stringify(b.prefs || {});
    if (t.length > 20000) throw new Err(413, 'Preferencias demasiado grandes');
    await redis('SET', P + 'prefs:' + u.id, t);
    return { ok: true };
  },

  async config(req, b) {
    const u = await usuario(req); soloAdmin(u);
    const c = b.config || {};
    if (!Array.isArray(c.plantillas) || !Array.isArray(c.formatos)) throw new Err(400, 'Configuración incompleta');
    const t = JSON.stringify({ plantillas: c.plantillas, formatos: c.formatos, reglas: c.reglas || [], reglamento: String(c.reglamento || ''), actualizado: hoy(), por: u.nombre });
    if (t.length > 900000) throw new Err(413, 'Configuración demasiado grande');
    await redis('SET', P + 'config', t);
    return { ok: true };
  },

  async nota(req, b) {
    const u = await usuario(req);
    const texto = String(b.texto || '').slice(0, 8000);
    if (!texto.trim()) throw new Err(400, 'Nota vacía');
    const n = { id: nuevoId(), autorId: u.id, autor: u.nombre, fecha: hoy(), plantilla: String(b.plantilla || '').slice(0, 120), texto };
    await pipe([['LPUSH', P + 'notas', JSON.stringify(n)], ['LTRIM', P + 'notas', 0, MAX_NOTAS - 1]]);
    return { ok: true };
  },

  async notas(req, b) {
    const u = await usuario(req);
    const todas = (await redis('LRANGE', P + 'notas', 0, MAX_NOTAS - 1) || []).map(json).filter(Boolean);
    const q = String(b.q || '').toLowerCase().trim();
    const equipo = u.admin && b.equipo;
    const lista = todas.filter(n => (equipo ? (!b.autorId || n.autorId === b.autorId) : n.autorId === u.id)
      && (!q || n.texto.toLowerCase().includes(q) || (n.autor || '').toLowerCase().includes(q)));
    return { notas: lista.slice(0, 300), total: lista.length };
  },

  async borrarNota(req, b) {
    const u = await usuario(req);
    const todas = await redis('LRANGE', P + 'notas', 0, MAX_NOTAS - 1) || [];
    const raw = todas.find(t => { const n = json(t); return n && n.id === b.id && (u.admin || n.autorId === u.id); });
    if (!raw) throw new Err(404, 'Nota no encontrada');
    await redis('LREM', P + 'notas', 1, raw);
    return { ok: true };
  },

  async staff(req) {
    const u = await usuario(req); soloAdmin(u);
    const todo = hashObj(await redis('HGETALL', P + 'staff'));
    return { staff: Object.values(todo).map(json).filter(Boolean).map(publico).sort((a, b) => (b.admin - a.admin) || a.nombre.localeCompare(b.nombre)) };
  },

  async crearStaff(req, b) {
    const u = await usuario(req); soloAdmin(u);
    const nombre = String(b.nombre || '').trim().slice(0, 60);
    if (!nombre) throw new Err(400, 'Falta el nombre');
    const codigo = nuevoCodigo();
    const s = { id: nuevoId(), nombre, admin: !!b.admin, hash: hashCodigo(codigo), creado: hoy(), final: codigo.slice(-4), por: u.nombre };
    await pipe([['HSET', P + 'staff', s.id, JSON.stringify(s)], ['SET', P + 'codigo:' + s.hash, s.id]]);
    return { codigo, miembro: publico(s) };
  },

  async regenerar(req, b) {
    const u = await usuario(req); soloAdmin(u);
    const s = json(await redis('HGET', P + 'staff', b.id));
    if (!s) throw new Err(404, 'No existe');
    const codigo = nuevoCodigo();
    const viejo = s.hash;
    s.hash = hashCodigo(codigo); s.final = codigo.slice(-4);
    await cerrarSesiones(s.id);
    await pipe([['DEL', P + 'codigo:' + viejo], ['SET', P + 'codigo:' + s.hash, s.id], ['HSET', P + 'staff', s.id, JSON.stringify(s)]]);
    return { codigo, miembro: publico(s) };
  },

  async cambiarRol(req, b) {
    const u = await usuario(req); soloAdmin(u);
    const s = json(await redis('HGET', P + 'staff', b.id));
    if (!s) throw new Err(404, 'No existe');
    if (s.admin && !b.admin) await comprobarOtroAdmin(s.id);
    s.admin = !!b.admin;
    await redis('HSET', P + 'staff', s.id, JSON.stringify(s));
    return { ok: true };
  },

  async revocar(req, b) {
    const u = await usuario(req); soloAdmin(u);
    const s = json(await redis('HGET', P + 'staff', b.id));
    if (!s) throw new Err(404, 'No existe');
    if (s.admin) await comprobarOtroAdmin(s.id);
    await cerrarSesiones(s.id);
    await pipe([['HDEL', P + 'staff', s.id], ['DEL', P + 'codigo:' + s.hash], ['DEL', P + 'prefs:' + s.id]]);
    return { ok: true };
  },
};

async function comprobarOtroAdmin(id) {
  const todo = Object.values(hashObj(await redis('HGETALL', P + 'staff'))).map(json).filter(Boolean);
  if (!todo.some(x => x.admin && x.id !== id)) throw new Err(400, 'Debe quedar al menos un administrador');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    if (!R_URL || !R_TOK) throw new Err(500, 'Falta conectar la base de datos (Upstash Redis) al proyecto de Vercel');
    if (req.method !== 'POST') throw new Err(405, 'Usa POST');
    const b = typeof req.body === 'string' ? json(req.body) || {} : (req.body || {});
    const fn = acciones[b.accion];
    if (!fn) throw new Err(400, 'Acción desconocida');
    await inicializar();
    res.status(200).json(await fn(req, b));
  } catch (e) {
    res.status(e.st || 500).json({ error: e.st ? e.message : 'Error del servidor: ' + e.message });
  }
}
