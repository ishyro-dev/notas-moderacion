/* Motor de notas: plantillas, formatos, generador y markdown de Discord (port 1:1 de la versión Java). */
var Motor = (function () {
  'use strict';
  var INI = '\u0001', FIN = '\u0002';
  var RESERVADOS = ['usuario', 'id', 'edad', 'dias13', 'fecha13', 'fechanac', 'hoy', 'fechacorta', 'duracion'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function vacio(s) { return s == null || String(s).trim() === ''; }
  function falta(e) { return INI + e + FIN; }
  function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = '0' + n; return n; }

  // ------------------------------------------------------------ fechas (fechas "locales" como {y,m,d})
  function hoy() { var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
  function fechaCorta(f) { return pad(f.d) + '/' + pad(f.m) + '/' + pad(f.y, 4); }
  function fechaLarga(f) { return f.d + ' de ' + MESES[f.m - 1] + ' de ' + f.y; }
  function bisiesto(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function diasMes(y, m) { return [31, bisiesto(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function valida(y, m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= diasMes(y, m); }
  function parseFecha(s) {
    if (vacio(s)) return null;
    s = String(s).trim();
    var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
    if (m && valida(+m[3], +m[2], +m[1])) return { y: +m[3], m: +m[2], d: +m[1] };
    m = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/.exec(s);
    if (m && valida(+m[1], +m[2], +m[3])) return { y: +m[1], m: +m[2], d: +m[3] };
    return null;
  }
  function masAnios(f, n) { var y = f.y + n, d = Math.min(f.d, diasMes(y, f.m)); return { y: y, m: f.m, d: d }; }
  function diasEntre(a, b) { return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000); }
  function anios(a, b) { var n = b.y - a.y; if (b.m < a.m || (b.m === a.m && b.d < a.d)) n--; return n; }
  function cmp(a, b) { return diasEntre(b, a); }
  function parseHora(s) {
    if (vacio(s)) return null;
    var m = /^(\d{1,2})[:.h](\d{2})$/.exec(String(s).trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function duracion(min) {
    var h = Math.floor(min / 60), m = min % 60;
    var sm = m + (m === 1 ? ' minuto' : ' minutos');
    if (h === 0) return sm;
    var sh = h + (h === 1 ? ' hora' : ' horas');
    return m === 0 ? sh : sh + ' y ' + sm;
  }

  // ------------------------------------------------------------ plantillas
  function parseCampo(interior) {
    var partes = interior.split('|');
    var c = { etiqueta: partes[0].trim(), tipo: 'corto', def: '', opciones: [] };
    c.clave = c.etiqueta.toLowerCase();
    for (var i = 1; i < partes.length; i++) {
      var p = partes[i], t = p.trim().toLowerCase();
      if (p.charAt(0) === '=') {
        c.def = p.substring(1);
        if (c.def.trim().toLowerCase() === '@hoy') c.def = fechaCorta(hoy());
      } else if (t === 'largo' || t === 'nacimiento' || t === 'casilla' || t === 'hora') c.tipo = t;
      else if (t.indexOf('opciones:') === 0) {
        c.tipo = 'opciones';
        c.opciones = p.trim().substring(9).split(';').map(function (x) { return x.trim(); });
      }
    }
    return c;
  }

  function campos(pl) {
    var vistos = {}, lista = [], re = /\{\{([^{}]+)\}\}/g, m;
    var t = (pl.sancion || '') + '\n' + (pl.cuerpo || '');
    while ((m = re.exec(t))) {
      var c = parseCampo(m[1]);
      if (!c.etiqueta || RESERVADOS.indexOf(c.clave) >= 0 || vistos[c.clave]) continue;
      vistos[c.clave] = 1;
      lista.push(c);
    }
    return lista;
  }

  function parseRegla(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s || s.charAt(0) === '#') return null;
    var i = s.indexOf('|');
    if (i < 0) {
      var m = /^(?:regla\s*)?(\d+)\s*[-:·]?\s*(.*)$/i.exec(s);
      return m ? { numero: m[1].trim(), motivo: m[2].trim() } : null;
    }
    return { numero: s.substring(0, i).trim().replace(/^regla\s*/i, ''), motivo: s.substring(i + 1).trim() };
  }
  function claveRegla(r) { return r.numero + '|' + r.motivo.toLowerCase(); }
  function textoRegla(r) { return r.numero + ' | ' + r.motivo; }
  function listaReglas(s) { return String(s || '').split(';').map(parseRegla).filter(Boolean); }

  function slug(s) {
    var n = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    n = n.replace(/[^a-z0-9ñ]+/g, '-').replace(/^-+|-+$/g, '');
    return n || 'nota';
  }

  // ------------------------------------------------------------ generador
  /* e = {usuarios:[{nick,id,sancion}], mencion, reglas:[{numero,motivo}], sancion, prefijo, nombre,
          plantilla, campos, valores:{clave:valor}, ticket, pruebas, moderador, formato:{bloques}, hoy} */
  function derivados(e) {
    var d = {}, f = e.hoy || hoy();
    d.hoy = fechaLarga(f);
    d.fechacorta = fechaCorta(f);
    for (var i = 0; i < e.usuarios.length; i++) {
      var u = e.usuarios[i];
      if (vacio(u.nick) && vacio(u.id) && vacio(u.sancion)) continue;
      d.usuario = (u.nick || '').trim(); d.id = (u.id || '').trim(); break;
    }
    var horas = [];
    e.campos.forEach(function (c) {
      if (c.tipo !== 'hora') return;
      var h = parseHora(e.valores[c.clave]);
      if (h != null) horas.push(h);
    });
    if (horas.length >= 2) { var dif = horas[1] - horas[0]; if (dif < 0) dif += 1440; d.duracion = duracion(dif); }
    for (var k = 0; k < e.campos.length; k++) {
      var c = e.campos[k];
      if (c.tipo !== 'nacimiento') continue;
      var n = parseFecha(e.valores[c.clave]);
      if (!n) break;
      var trece = masAnios(n, 13);
      d.fechanac = fechaLarga(n);
      d.edad = String(anios(n, f));
      d.fecha13 = fechaLarga(trece);
      d.dias13 = String(Math.max(0, diasEntre(f, trece)));
      d._yaTiene13 = cmp(trece, f) <= 0;
      break;
    }
    return d;
  }

  function valor(interior, e, mapa, der) {
    var c = parseCampo(interior);
    if (RESERVADOS.indexOf(c.clave) >= 0) return der[c.clave] == null ? '' : der[c.clave];
    var def = mapa[c.clave] || c;
    var raw = e.valores[c.clave];
    if (raw == null) raw = def.tipo === 'casilla' ? '' : def.def;
    if (def.tipo === 'casilla') return raw === '1' ? def.def.trim() : '';
    if (def.tipo === 'hora') { var h = parseHora(raw); return h == null ? '' : pad(Math.floor(h / 60)) + ':' + pad(h % 60); }
    if (def.tipo === 'nacimiento') { var f = parseFecha(raw); return f ? fechaLarga(f) : ''; }
    return String(raw).trim();
  }

  function etiquetaDe(interior) {
    var et = parseCampo(interior).etiqueta, l = et.toLowerCase();
    if (l === 'dias13') return 'días hasta los 13 (falta fecha de nacimiento)';
    if (l === 'fecha13') return 'fecha en que cumple 13';
    if (l === 'edad') return 'edad';
    if (l === 'duracion') return 'duración (faltan horas)';
    return et;
  }

  function sustituir(t, e) {
    var mapa = {}; e.campos.forEach(function (c) { mapa[c.clave] = c; });
    var der = derivados(e);
    t = String(t || '').replace(/\[\[([\s\S]*?)\]\]/g, function (_, dentro) {
      var si = dentro, no = '', k = dentro.indexOf('|sino|');
      if (k >= 0) { si = dentro.substring(0, k); no = dentro.substring(k + 6); }
      var completo = true, re = /\{\{([^{}]+)\}\}/g, m;
      while ((m = re.exec(si))) if (valor(m[1], e, mapa, der) === '') { completo = false; break; }
      return completo ? si : no;
    });
    return t.replace(/\{\{([^{}]+)\}\}/g, function (_, dentro) {
      var v = valor(dentro, e, mapa, der);
      return v === '' ? falta(etiquetaDe(dentro)) : v;
    });
  }

  function unirY(l) {
    if (!l.length) return '';
    if (l.length === 1) return l[0];
    return l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
  }
  function textoReglas(reglas) {
    if (!reglas.length) return null;
    var nums = [], mot = [];
    reglas.forEach(function (r) {
      if (nums.indexOf(r.numero) < 0) nums.push(r.numero);
      if (r.motivo && mot.indexOf(r.motivo) < 0) mot.push(r.motivo);
    });
    var s = 'Regla ' + unirY(nums);
    if (mot.length) s += ' - ' + unirY(mot);
    return s;
  }
  function referencia(u, mencion) {
    var nick = (u.nick || '').trim(), id = (u.id || '').trim(), ref;
    if (mencion && id) ref = '<@' + id + '>';
    else ref = '@' + (nick || falta('usuario'));
    return ref + ' - ' + (id || falta('ID'));
  }
  function cabecera(e) {
    var us = e.usuarios.filter(function (u) { return !(vacio(u.nick) && vacio(u.id) && vacio(u.sancion)); });
    if (!us.length) us = [{ nick: '', id: '', sancion: '' }];
    var reglas = textoReglas(e.reglas);
    var global = sustituir((e.sancion || '').trim(), e);
    var grupos = [], sanciones = [];
    us.forEach(function (u) {
      var s = vacio(u.sancion) ? global : sustituir(u.sancion.trim(), e);
      if (grupos.length && sanciones[sanciones.length - 1] === s) grupos[grupos.length - 1].push(u);
      else { grupos.push([u]); sanciones.push(s); }
    });
    var out = '', antMult = false;
    grupos.forEach(function (g, i) {
      var s = sanciones[i] || falta('sanción');
      var cola = reglas == null ? s : reglas + ' | ' + s;
      var mult = g.length > 1;
      if (i > 0) out += (mult || antMult) ? '\n\n' : '\n';
      if (mult) { g.forEach(function (u) { out += referencia(u, e.mencion) + '\n'; }); out += cola; }
      else out += referencia(g[0], e.mencion) + ' | ' + cola;
      antMult = mult;
    });
    return out;
  }

  function normalizar(s) {
    return String(s).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function limpiar(s) {
    s = String(s).replace(/\u0001[^\u0002]*\u0002/g, '');
    s = s.replace(/ {2,}/g, ' ').replace(/ +([.,;:])/g, '$1');
    return normalizar(s);
  }
  function faltantes(s) {
    var l = [], re = /\u0001([^\u0002]*)\u0002/g, m;
    while ((m = re.exec(s))) if (l.indexOf(m[1]) < 0) l.push(m[1]);
    return l;
  }

  function dividir(cuerpo) {
    var m = /^[ \t]*\[conclusi[oó]n\][ \t]*$/im.exec(cuerpo || '');
    if (m) return [cuerpo.substring(0, m.index), cuerpo.substring(m.index + m[0].length)];
    return [cuerpo || '', ''];
  }

  // ------------------------------------------------------------ formatos
  var MARCA = /\{([a-záéíóúñ]+)(\|([^{}\n]*))?\}/gi;
  var MARCADORES = [
    ['cabecera', '@usuario - ID | Regla | Sanción (una línea por usuario)'],
    ['nombre', 'Lo escrito en Nombre de usuario / apodos'],
    ['apodos', 'Igual que {nombre}, pero con el prefijo elegido (Apodos:, Nombre:)'],
    ['cuerpo', 'Desarrollo de la plantilla'],
    ['conclusion', 'Conclusión de la plantilla (lo que va tras [conclusión])'],
    ['ticket', 'Enlace del ticket'],
    ['pruebas', 'Pruebas'],
    ['sancion', 'Sanción general'],
    ['reglas', 'Regla X - Motivo'],
    ['fecha', 'Fecha de hoy (dd/mm/aaaa)'],
    ['moderador', 'Tu nombre (perfil)']
  ];
  function usa(formato, marcador) {
    return (formato.bloques || []).some(function (b) {
      var re = new RegExp(MARCA.source, 'gi'), m;
      while ((m = re.exec(b))) if (m[1].toLowerCase() === marcador) return true;
      return false;
    });
  }
  function conFormato(p) {
    var t = p.trim();
    return ['**', '__', '-#', '>', '- ', '* ', '#', 'http', '`', '~~', '||', '<@'].some(function (x) { return t.indexOf(x) === 0; });
  }
  function prefijar(valor, prefijo) {
    if (!prefijo) return valor;
    return valor.split('\n\n').map(function (p) {
      if (!p.trim() || conFormato(p)) return p;
      return p.split('\n').map(function (l) { return prefijo + l; }).join('\n');
    }).join('\n\n');
  }
  function tieneMarcas(t) { return new RegExp(MARCA.source, 'i').test(t); }
  function todasVacias(t, v) {
    var re = new RegExp(MARCA.source, 'gi'), m;
    while ((m = re.exec(t))) {
      var k = m[1].toLowerCase();
      if (!(k in v)) return false;
      if (!vacio(v[k])) return false;
    }
    return true;
  }
  function aplicarFormato(formato, v) {
    var salida = [];
    (formato.bloques || []).forEach(function (bloque) {
      if (tieneMarcas(bloque) && todasVacias(bloque, v)) return;
      var lineas = [];
      bloque.split('\n').forEach(function (linea) {
        if (tieneMarcas(linea) && todasVacias(linea, v)) return;
        lineas.push(linea.replace(new RegExp(MARCA.source, 'gi'), function (todo, k, _, pre) {
          k = k.toLowerCase();
          if (!(k in v)) return todo;
          var val = v[k];
          if (pre != null) val = prefijar(val, pre);
          return val;
        }));
      });
      var b = lineas.join('\n');
      if (b.trim()) salida.push(b);
    });
    return salida.join('\n\n');
  }

  function valoresFormato(e) {
    var v = {};
    v.cabecera = cabecera(e);
    var nombre = (e.nombre || '').trim(), pre = (e.prefijo || '').trim();
    if (pre.charAt(0) === '(') pre = '';
    v.nombre = nombre;
    v.apodos = nombre ? (pre ? pre + ' ' : '') + nombre : '';
    var partes = dividir(e.plantilla ? e.plantilla.cuerpo : '');
    v.cuerpo = normalizar(sustituir(partes[0], e));
    v.conclusion = normalizar(sustituir(partes[1], e));
    v.ticket = (e.ticket || '').trim();
    v.pruebas = (e.pruebas || '').trim();
    v.sancion = sustituir((e.sancion || '').trim(), e);
    v.reglas = textoReglas(e.reglas) || '';
    v.fecha = fechaCorta(e.hoy || hoy());
    v.moderador = e.moderador || '';
    return v;
  }
  function generar(e) { return normalizar(aplicarFormato(e.formato || { bloques: ['{cabecera}', '{cuerpo}', '{conclusion}'] }, valoresFormato(e))); }

  // ------------------------------------------------------------ markdown → HTML
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function inline(s, nicks) {
    var out = '', buf = '', st = { b: 0, it: 0, itG: 0, u: 0, s: 0, sp: 0 }, i = 0, n = s.length;
    function abrir() { var h = ''; if (st.sp) h += '<span class="spoiler">'; if (st.b) h += '<strong>'; if (st.it) h += '<em>'; if (st.u) h += '<u>'; if (st.s) h += '<s>'; return h; }
    function cerrar() { var h = ''; if (st.s) h += '</s>'; if (st.u) h += '</u>'; if (st.it) h += '</em>'; if (st.b) h += '</strong>'; if (st.sp) h += '</span>'; return h; }
    function vaciar() { if (buf) { out += abrir() + esc(buf) + cerrar(); buf = ''; } }
    function emit(html) { vaciar(); out += abrir() + html + cerrar(); }
    while (i < n) {
      var c = s.charAt(i);
      if (c === '\\' && i + 1 < n && '*_~`|\\<>#'.indexOf(s.charAt(i + 1)) >= 0) { buf += s.charAt(i + 1); i += 2; continue; }
      if (c === INI) {
        var j = s.indexOf(FIN, i);
        if (j > 0) { emit('<span class="falta">' + esc(s.substring(i + 1, j)) + '</span>'); i = j + 1; continue; }
      }
      if (c === '<') {
        var m = /^<(@!?|@&|#)(\d+)>/.exec(s.substring(i));
        if (m) {
          var txt = m[1] === '#' ? '#canal' : m[1] === '@&' ? '@rol' : '@' + (nicks[m[2]] || 'usuario-desconocido');
          emit('<span class="men">' + esc(txt) + '</span>'); i += m[0].length; continue;
        }
      }
      if (s.substr(i, 7) === 'http://' || s.substr(i, 8) === 'https://') {
        var k = i; while (k < n && !/\s/.test(s.charAt(k))) k++;
        var url = s.substring(i, k);
        if (/^https?:\/\/(\w+\.)?discord(app)?\.com\/channels\//.test(url)) emit('<span class="men" title="' + esc(url) + '"># › mensaje</span>');
        else emit('<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>');
        i = k; continue;
      }
      var dos = s.substr(i, 2);
      if (dos === '**' && (st.b || s.indexOf('**', i + 2) > i + 2)) { vaciar(); st.b = !st.b; i += 2; continue; }
      if (dos === '__' && (st.u || s.indexOf('__', i + 2) > i + 2)) { vaciar(); st.u = !st.u; i += 2; continue; }
      if (dos === '~~' && (st.s || s.indexOf('~~', i + 2) > i + 2)) { vaciar(); st.s = !st.s; i += 2; continue; }
      if (dos === '||' && (st.sp || s.indexOf('||', i + 2) > i + 2)) { vaciar(); st.sp = !st.sp; i += 2; continue; }
      if (c === '`') {
        var q = s.indexOf('`', i + 1);
        if (q > i + 1) { emit('<code>' + esc(s.substring(i + 1, q)) + '</code>'); i = q + 1; continue; }
      }
      if (c === '*' && !st.itG && (st.it || s.indexOf('*', i + 1) > i + 1)) { vaciar(); st.it = !st.it; i++; continue; }
      if (c === '_') {
        var antes = i === 0 || !/[\p{L}\p{N}]/u.test(s.charAt(i - 1));
        var despues = i + 1 >= n || !/[\p{L}\p{N}]/u.test(s.charAt(i + 1));
        if (!st.it && antes) {
          var z = s.indexOf('_', i + 1);
          if (z > i + 1 && (z + 1 >= n || !/[\p{L}\p{N}]/u.test(s.charAt(z + 1)))) { vaciar(); st.it = 1; st.itG = 1; i++; continue; }
        } else if (st.it && st.itG && despues) { vaciar(); st.it = 0; st.itG = 0; i++; continue; }
      }
      buf += c; i++;
    }
    vaciar();
    return out;
  }

  function markdown(texto, nicks) {
    nicks = nicks || {};
    var lineas = String(texto).split('\n'), html = '', enCodigo = false, codigo = [];
    lineas.forEach(function (l) {
      if (l.trim().indexOf('```') === 0) {
        if (enCodigo) { html += '<pre>' + esc(codigo.join('\n')) + '</pre>'; codigo = []; }
        enCodigo = !enCodigo; return;
      }
      if (enCodigo) { codigo.push(l); return; }
      l = l.replace(/:z(\d+):/g, '[$1]');
      var m;
      if ((m = /^(#{1,3}) (.*)$/.exec(l))) html += '<div class="ln h' + m[1].length + '">' + inline(m[2], nicks) + '</div>';
      else if (l.indexOf('-# ') === 0) html += '<div class="ln sub">' + inline(l.substring(3), nicks) + '</div>';
      else if (l.indexOf('>>> ') === 0 || l.indexOf('> ') === 0 || l === '>') html += '<div class="ln cita">' + inline(l === '>' ? '' : l.substring(l.indexOf(' ') + 1), nicks) + '</div>';
      else if (l.indexOf('- ') === 0 || l.indexOf('* ') === 0) html += '<div class="ln li">' + inline(l.substring(2), nicks) + '</div>';
      else html += '<div class="ln">' + inline(l, nicks) + '</div>';
    });
    if (enCodigo && codigo.length) html += '<pre>' + esc(codigo.join('\n')) + '</pre>';
    return html;
  }

  /** Secciones del reglamento: { "1": ["Respeto", "texto..."] } */
  function secciones(txt) {
    var res = {}, re = /^#{1,3}\s*(\d+)\.?\s*(.*)$/gm, m, pos = [];
    while ((m = re.exec(txt))) pos.push({ n: m[1], t: m[2].trim(), ini: m.index, fin: m.index + m[0].length });
    pos.forEach(function (p) {
      var sig = /^#{1,3}\s/gm; sig.lastIndex = p.fin;
      var s = sig.exec(txt);
      res[p.n] = [p.t, txt.substring(p.fin, s ? s.index : txt.length).trim()];
    });
    return res;
  }

  return {
    INI: INI, FIN: FIN, vacio: vacio, hoy: hoy, fechaCorta: fechaCorta, fechaLarga: fechaLarga, parseFecha: parseFecha,
    parseHora: parseHora, parseCampo: parseCampo, campos: campos, parseRegla: parseRegla, claveRegla: claveRegla,
    textoRegla: textoRegla, listaReglas: listaReglas, slug: slug, derivados: derivados, generar: generar,
    limpiar: limpiar, faltantes: faltantes, normalizar: normalizar, usa: usa, MARCADORES: MARCADORES,
    markdown: markdown, esc: esc, secciones: secciones, masAnios: masAnios
  };
})();
if (typeof module !== 'undefined') module.exports = Motor;
