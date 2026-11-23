// Prepara el proyecto para Vercel.
//   node build.mjs              -> regenera api/_app.js e index.html a partir de src/
//   node build.mjs admin Nombre -> crea un código de administrador nuevo (solo se guarda su hash)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir = path.dirname(new URL(import.meta.url).pathname);
const L = f => fs.readFileSync(path.join(dir, 'src', f), 'utf8');

const [modo, nombre] = process.argv.slice(2);
if (modo === 'admin') {
  const ALF = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', b = crypto.randomBytes(16);
  let c = ''; for (let i = 0; i < 16; i++) { c += ALF[b[i] % 32]; if (i % 4 === 3 && i < 15) c += '-'; }
  const hash = crypto.createHash('sha256').update('nm:' + c.replace(/-/g, '')).digest('hex');
  fs.writeFileSync(path.join(dir, 'api', '_admin.js'),
    `// Hash del código del primer administrador (el código en sí no se guarda en ningún sitio).\nexport const ADMIN_HASH = '${hash}';\nexport const ADMIN_NOMBRE = ${JSON.stringify(nombre || 'Administrador')};\n`);
  console.log('CODIGO_ADMIN=' + c);
} else {
  const app = { css: L('app.css'), html: '<div id="app"></div>', js: L('motor.js') + '\n' + L('app.js'), def: JSON.parse(L('defaults.json')) };
  fs.writeFileSync(path.join(dir, 'api', '_app.js'), '// Generado por build.mjs: la app solo se entrega a usuarios con sesión.\nexport default ' + JSON.stringify(app) + ';\n');
  fs.copyFileSync(path.join(dir, 'src', 'acceso.html'), path.join(dir, 'index.html'));
  console.log('api/_app.js e index.html listos');
}
