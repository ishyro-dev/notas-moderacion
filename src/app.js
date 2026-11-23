/* Notas de Moderación — interfaz web estilo Discord. */
(function () {
  'use strict';
  var M = Motor;
  var SES = window.__NM || null;          // sesión (la pone la pantalla de acceso)
  var DEF = window.__NM_DEF;              // valores predeterminados
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var CTRL = MAC ? 'Cmd' : 'Ctrl';

  // ================================================================ utilidades
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) for (var k in props) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) agregar(el, arguments[i]);
    return el;
  }
  function agregar(el, k) {
    if (k == null || k === false) return;
    if (Array.isArray(k)) { k.forEach(function (x) { agregar(el, x); }); return; }
    el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function leer(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function iniciales(n) {
    var p = String(n || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p.length === 1 ? p[0].charAt(0) : p[0].charAt(0) + p[1].charAt(0)).toUpperCase();
  }
  function avatar(nombre, color, tam) {
    return h('div', { class: 'avatar', style: { width: tam + 'px', height: tam + 'px', background: color, fontSize: Math.round(tam * 0.4) + 'px' }, text: iniciales(nombre) });
  }
  function toast(t, color) {
    var e = h('div', { class: 'toast', text: t, style: color ? { color: color } : null });
    document.body.appendChild(e);
    setTimeout(function () { e.remove(); }, 2600);
  }
  function copiarTexto(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (ok, mal) {
      var ta = h('textarea', { value: t, style: { position: 'fixed', opacity: '0' } });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : mal(); } catch (e) { mal(e); }
      ta.remove();
    });
  }
  function descargar(nombre, texto, tipo) {
    var a = h('a', { href: URL.createObjectURL(new Blob([texto], { type: tipo || 'application/json' })), download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ================================================================ datos (servidor)
  var ADMIN = !SES || !!(SES.yo && SES.yo.admin);
  function api(accion, datos) {
    if (!SES) return Promise.resolve({});
    return SES.api(accion, datos).catch(function (e) {
      if (e.status === 401) { alerta('Sesión terminada', e.message + '. Vuelve a introducir tu código.').then(function () { SES.salir(); }); }
      throw e;
    });
  }
  function porDefecto() {
    return {
      plantillas: DEF.plantillas.map(function (p) { return { id: uid(), nombre: p.nombre, reglas: p.reglas, sancion: p.sancion, cuerpo: p.cuerpo }; }),
      formatos: DEF.formatos.map(function (f) { return { id: uid(), nombre: f.nombre, bloques: f.bloques.slice() }; }),
      reglas: DEF.reglas.slice(),
      reglamento: DEF.reglamento,
      perfil: { nombre: SES ? SES.yo.nombre : 'Moderador', rol: '', color: '#5865F2' },
      formatoActual: null, zoomEditor: 100, zoomVista: 100, zoomRegl: 100, mencion: true, columna: 0.5
    };
  }
  var CLAVES_CONFIG = ['plantillas', 'formatos', 'reglas', 'reglamento'];
  var CLAVES_PREFS = ['perfil', 'formatoActual', 'zoomEditor', 'zoomVista', 'zoomRegl', 'mencion', 'columna'];
  function sub(o, claves) { var r = {}; claves.forEach(function (k) { r[k] = o[k]; }); return r; }
  var D = porDefecto();
  if (SES && SES.config) CLAVES_CONFIG.forEach(function (k) { if (SES.config[k] != null) D[k] = SES.config[k]; });
  if (SES && SES.prefs) CLAVES_PREFS.forEach(function (k) { if (SES.prefs[k] != null) D[k] = SES.prefs[k]; });
  var cfgEnviada = JSON.stringify(sub(D, CLAVES_CONFIG)), prefsEnviadas = JSON.stringify(sub(D, CLAVES_PREFS));
  var tGuardar = null;
  /** Guarda en la base de datos (con un pequeño retardo para agrupar cambios). */
  function guardar(inmediato) {
    clearTimeout(tGuardar);
    tGuardar = setTimeout(function () {
      var pr = JSON.stringify(sub(D, CLAVES_PREFS));
      if (pr !== prefsEnviadas) { prefsEnviadas = pr; api('prefs', { prefs: JSON.parse(pr) }).catch(function (e) { toast('No se guardaron tus preferencias: ' + e.message, 'var(--rojo)'); }); }
      if (!ADMIN) return;
      var cf = JSON.stringify(sub(D, CLAVES_CONFIG));
      if (cf !== cfgEnviada) {
        cfgEnviada = cf;
        api('config', { config: JSON.parse(cf) }).then(function () { if (inmediato) toast('Cambios guardados para todo el equipo', 'var(--verde)'); },
          function (e) { cfgEnviada = ''; toast('No se guardaron los cambios del equipo: ' + e.message, 'var(--rojo)'); });
      }
    }, inmediato ? 0 : 700);
  }
  if (SES && ADMIN && !SES.config) guardar(true);   // primera vez: sube las plantillas originales

  function reglas() { return D.reglas.map(M.parseRegla).filter(Boolean); }
  function formatoActual() {
    return D.formatos.filter(function (f) { return f.id === D.formatoActual; })[0] || D.formatos[0] || { id: '', nombre: '', bloques: ['{cabecera}', '{cuerpo}'] };
  }

  // ================================================================ estado del formulario
  var actual = null, camposAct = [], memoria = {};
  var F = { usuarios: [{ nick: '', id: '', sancion: '' }], prefijo: 'Apodos:', nombre: '', sel: {}, sancion: '', valores: {}, ticket: '', pruebas: '', filtro: '' };
  var ui = {};

  function estado() {
    var rs = reglas().filter(function (r) { return F.sel[M.claveRegla(r)]; });
    return {
      usuarios: F.usuarios.map(function (u) { return { nick: u.nick, id: String(u.id || '').replace(/\D/g, ''), sancion: u.sancion }; }),
      mencion: D.mencion, reglas: rs, sancion: F.sancion, prefijo: F.prefijo, nombre: F.nombre,
      plantilla: actual, campos: camposAct, valores: F.valores, ticket: F.ticket, pruebas: F.pruebas,
      moderador: D.perfil.nombre, formato: formatoActual(), hoy: M.hoy()
    };
  }

  // ================================================================ esqueleto
  function montar() {
    var raiz = $('#app');
    raiz.innerHTML = '';
    ui.canales = h('div', { class: 'canales' });
    ui.userbar = h('div', { class: 'userbar' });
    ui.topT = h('span', { class: 't' });
    ui.topD = h('span', { class: 'd' });
    ui.form = h('div', { class: 'form' });
    ui.scrollForm = h('div', { class: 'scroll' }, ui.form);
    ui.msg = h('div', { class: 'msg' });
    ui.scrollVista = h('div', { class: 'scroll' }, ui.msg);
    ui.aviso = h('div', { class: 'aviso' });
    ui.contador = h('span', { class: 'contador', title: 'Límite de Discord: 2000 caracteres (4000 con Nitro)' });
    ui.zEditor = zoomControl(D.zoomEditor, function (v) { D.zoomEditor = v; guardar(); aplicarZoom(); });
    ui.zVista = zoomControl(D.zoomVista, function (v) { D.zoomVista = v; guardar(); aplicarZoom(); });
    rueda(ui.scrollForm, ui.zEditor); rueda(ui.scrollVista, ui.zVista);

    ui.split = h('div', { class: 'split' },
      h('section', { class: 'pane' },
        h('div', { class: 'pane-head' }, h('span', { class: 'lbl', text: 'Formulario' }), ui.zEditor),
        ui.scrollForm),
      ui.divider = h('div', { class: 'divider', title: 'Arrastra para cambiar el ancho' }),
      h('section', { class: 'pane prev' },
        h('div', { class: 'pane-head' }, h('span', null, h('span', { class: 'lbl', style: { display: 'inline' }, text: 'Vista previa' }), h('span', { class: 'sub', text: '  ·  así se verá en Discord' })), ui.zVista),
        ui.scrollVista,
        h('div', { class: 'barra-copiar' }, ui.aviso,
          h('div', { class: 'entrada' }, h('span', { class: 'ayuda', text: CTRL + '+Enter para copiar' }), ui.contador,
            h('button', { class: 'btn', style: { padding: '9px 22px' }, text: 'Copiar nota', onclick: copiar })))));
    divisor();

    agregar(raiz, [
      h('nav', { class: 'rail' },
        h('div', { class: 'server', title: 'Notas de Moderación', text: 'NM' }),
        h('div', { class: 'rail-sep' }),
        h('button', { class: 'rail-btn', title: 'Nueva nota (Alt+N)', text: '+', onclick: nuevaNota })),
      h('aside', { class: 'sidebar' }, h('div', { class: 'side-head', text: 'Notas de Moderación' }), ui.canales, ui.userbar),
      h('main', null,
        h('div', { class: 'topbar' }, h('span', { class: 'h', text: '#' }), ui.topT, h('span', { class: 'vsep' }), ui.topD,
          h('button', { class: 'btn sec peq', text: 'Nueva nota', title: 'Vacía el formulario (Alt+N)', onclick: nuevaNota }),
          ADMIN ? h('button', { class: 'btn sec peq', text: 'Editar plantilla', onclick: function () { editorPlantillas(false); } }) : null),
        ui.split)
    ]);
    pintarUsuario();
    pintarCanales();
    aplicarZoom();
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); copiar(); }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); nuevaNota(); }
    });
  }

  function divisor() {
    function poner(fr) { ui.split.style.gridTemplateColumns = fr + 'fr 4px ' + (1 - fr) + 'fr'; }
    poner(D.columna || 0.5);
    ui.divider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var r = ui.split.getBoundingClientRect();
      function mover(ev) { var fr = Math.min(0.8, Math.max(0.25, (ev.clientX - r.left) / r.width)); D.columna = fr; poner(fr); }
      function soltar() { document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', soltar); guardar(); }
      document.addEventListener('mousemove', mover);
      document.addEventListener('mouseup', soltar);
    });
  }

  function zoomControl(valor, cambio) {
    var rango = h('input', { type: 'range', min: 60, max: 220, step: 5, value: valor, title: 'Zoom (también ' + CTRL + ' + rueda del ratón)' });
    var pct = h('span', { class: 'pct', text: valor + '%', title: 'Doble clic: volver a 100%' });
    var cont = h('div', { class: 'zoom' });
    function fijar(v) { v = Math.max(60, Math.min(220, Math.round(v / 5) * 5)); rango.value = v; pct.textContent = v + '%'; cont.valor = v; cambio(v); }
    rango.addEventListener('input', function () { fijar(+rango.value); });
    pct.addEventListener('dblclick', function () { fijar(100); });
    agregar(cont, [h('button', { text: '−', title: 'Alejar', onclick: function () { fijar(cont.valor - 10); } }), rango,
      h('button', { text: '+', title: 'Acercar', onclick: function () { fijar(cont.valor + 10); } }), pct]);
    cont.valor = valor; cont.fijar = fijar;
    return cont;
  }
  function rueda(el, zc) {
    el.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zc.fijar(zc.valor + (e.deltaY < 0 ? 10 : -10));
    }, { passive: false });
  }
  function aplicarZoom() {
    ui.form.style.zoom = D.zoomEditor / 100;
    ui.msg.style.zoom = D.zoomVista / 100;
  }

  function pintarUsuario() {
    var p = D.perfil;
    ui.userbar.innerHTML = '';
    agregar(ui.userbar, [avatar(p.nombre, p.color, 32),
      h('div', { class: 'nombres' }, h('div', { class: 'n', text: p.nombre || 'Moderador' }),
        h('div', { class: 'r', text: p.rol || (ADMIN ? 'Administrador' : 'Staff') })),
      h('button', { class: 'icono', title: 'Perfil', html: '&#9881;', onclick: editarPerfil }),
      SES ? h('button', { class: 'icono', title: 'Cerrar sesión', html: '&#x23FB;', onclick: cerrarSesion }) : null]);
  }

  function canal(texto, sel, accion, extra) {
    return h('div', { class: 'canal' + (sel ? ' sel' : '') + (extra ? ' ' + extra : ''), title: texto, onclick: accion },
      h('span', { class: 'h', text: '#' }), h('span', { text: texto }));
  }
  function pintarCanales() {
    ui.canales.innerHTML = '';
    agregar(ui.canales, h('div', { class: 'cat' }, h('span', { text: 'Plantillas' }),
      ADMIN ? h('button', { text: '+', title: 'Crear plantilla', onclick: function () { editorPlantillas(true); } }) : null));
    D.plantillas.forEach(function (p) {
      var c = canal(M.slug(p.nombre), actual && actual.id === p.id, function () { cargarPlantilla(p); });
      c.title = p.nombre;
      ui.canales.appendChild(c);
    });
    agregar(ui.canales, h('div', { class: 'cat' }, h('span', { text: 'Herramientas' })));
    agregar(ui.canales, [
      canal('reglamento', false, verReglamento),
      canal('mis-notas', false, function () { verHistorial(false); })
    ]);
    if (ADMIN) {
      agregar(ui.canales, h('div', { class: 'cat' }, h('span', { text: 'Administración' })));
      agregar(ui.canales, [
        canal('registro-del-equipo', false, function () { verHistorial(true); }, 'admin'),
        canal('gestion-del-staff', false, panelStaff, 'admin'),
        canal('formatos', false, organizarFormatos, 'admin'),
        canal('editar-plantillas', false, function () { editorPlantillas(false); }, 'admin'),
        canal('lista-de-reglas', false, editarReglas, 'admin'),
        canal('copia-de-seguridad', false, respaldo, 'admin')
      ]);
    }
  }

  // ================================================================ formulario
  function seccion(titulo, contenido, margen) {
    return h('div', { class: 'sec', style: margen != null ? { marginTop: margen + 'px' } : null }, titulo ? h('span', { class: 'lbl', text: titulo }) : null, contenido);
  }
  function entrada(valor, ayuda, alCambiar, extra) {
    var e = h('input', Object.assign({ class: 'in', value: valor || '', placeholder: ayuda || '' }, extra || {}));
    e.addEventListener('input', function () { alCambiar(e.value); refrescar(); });
    return e;
  }

  function cargarPlantilla(p) {
    actual = p;
    F.sel = {};
    var lista = reglas(), cambio = false;
    M.listaReglas(p.reglas).forEach(function (r) {
      if (!lista.some(function (x) { return M.claveRegla(x) === M.claveRegla(r); })) { D.reglas.push(M.textoRegla(r)); cambio = true; }
      F.sel[M.claveRegla(r)] = true;
    });
    if (cambio) guardar();
    F.sancion = p.sancion;
    camposAct = M.campos(p);
    F.valores = {};
    camposAct.forEach(function (c) {
      F.valores[c.clave] = memoria[c.clave] != null ? memoria[c.clave] : (c.tipo === 'casilla' ? '' : (c.tipo === 'opciones' && !c.def ? (c.opciones[0] || '') : c.def));
    });
    ui.topT.textContent = M.slug(p.nombre);
    ui.topD.textContent = p.nombre;
    pintarCanales();
    pintarFormulario();
    refrescar();
  }

  function pintarFormulario() {
    var f = ui.form, scroll = ui.scrollForm.scrollTop;
    f.innerHTML = '';
    agregar(f, [h('h2', { text: 'Redactar nota' }), h('div', { class: 'hint', style: { fontSize: '14px', marginTop: '4px' }, text: 'Rellena los campos; la vista previa se actualiza al instante.' })]);

    // Formato
    var selF = h('select', { class: 'in', onchange: function () { D.formatoActual = selF.value; guardar(); pintarFormulario(); refrescar(); } });
    D.formatos.forEach(function (x) { selF.appendChild(h('option', { value: x.id, text: x.nombre, selected: x.id === formatoActual().id })); });
    agregar(f, seccion('Formato de la nota', h('div', { class: 'row' }, h('div', { class: 'grow' }, selF),
      ADMIN ? h('button', { class: 'enlace', text: 'Organizar formatos', onclick: organizarFormatos }) : null)));

    // Usuarios
    ui.usuarios = h('div');
    pintarUsuarios();
    var chkM = h('input', { type: 'checkbox', checked: D.mencion, onchange: function () { D.mencion = chkM.checked; guardar(); refrescar(); } });
    agregar(f, seccion('Usuarios reportados', [ui.usuarios,
      h('button', { class: 'enlace', text: '+ Añadir otro usuario', onclick: function () { F.usuarios.push({ nick: '', id: '', sancion: '' }); pintarUsuarios(); refrescar(); } }),
      h('label', { class: 'chk', style: { marginTop: '6px' }, title: 'Activado: la cabecera usa <@ID> y Discord la convierte en mención.\nDesactivado: escribe @nick en texto plano.' }, chkM, h('span', { text: 'Usar mención real (<@ID>)' }))]));

    // Nombre / apodos
    var usaApodos = M.usa(formatoActual(), 'apodos');
    var pre = h('select', { class: 'in', style: { width: '140px' }, title: 'Prefijo usado por el marcador {apodos} del formato', onchange: function () { F.prefijo = pre.value; refrescar(); } });
    ['Apodos:', 'Nombre:', '(sin prefijo)'].forEach(function (x) { pre.appendChild(h('option', { value: x, text: x, selected: F.prefijo === x })); });
    agregar(f, seccion('Nombre de usuario / apodos (opcional)', h('div', { class: 'row' }, usaApodos ? pre : null,
      h('div', { class: 'grow' }, entrada(F.nombre, 'p. ej. emixx2275', function (v) { F.nombre = v; })))));

    // Reglas
    ui.reglas = h('div', { class: 'reglas' });
    var filtro = entrada(F.filtro, 'Buscar regla por número o texto (p. ej. 10, hacks, spam)...', function (v) { F.filtro = v; pintarReglas(); });
    pintarReglas();
    agregar(f, seccion('Reglas infringidas', [filtro, ui.reglas,
      h('div', { style: { marginTop: '4px' } }, h('button', { class: 'enlace', text: 'Ver reglamento', onclick: verReglamento }),
        ADMIN ? h('span', { style: { color: 'var(--muted)', margin: '0 8px' }, text: '·' }) : null,
        ADMIN ? h('button', { class: 'enlace', text: 'Editar lista de reglas', onclick: editarReglas }) : null)]));

    // Sanción
    var dl = h('datalist', { id: 'lista-sanciones' });
    ['Nota', 'Se deja nota', 'Se deja nota - Enviado a verificación', 'Recomendación', 'Advertencia', 'Warn', 'Registro', 'Mute', 'Ban',
      'Baneo temporal de X días', 'Registro + Baneo temporal de X días', 'Enviado a verificación'].forEach(function (x) { dl.appendChild(h('option', { value: x })); });
    agregar(f, seccion('Sanción', [entrada(F.sancion, 'Escribe o elige', function (v) { F.sancion = v; }, { list: 'lista-sanciones' }), dl,
      h('div', { class: 'hint', text: 'Escribe o elige. Los usuarios con sanción propia se agrupan aparte.' })]));

    // Campos de la plantilla
    agregar(f, h('div', { class: 'divsec' }, h('span', { class: 'lbl', text: 'Detalles · ' + (actual ? actual.nombre : '') })));
    ui.infoNac = null; ui.infoDur = null;
    if (!camposAct.length) agregar(f, h('div', { class: 'hint', style: { fontStyle: 'italic', fontSize: '14px', marginTop: '14px' }, text: 'Esta plantilla no tiene campos para rellenar.' }));
    var hayHora = false;
    camposAct.forEach(function (c) {
      var v = F.valores[c.clave];
      function set(x) { F.valores[c.clave] = x; }
      if (c.tipo === 'casilla') {
        var cb = h('input', { type: 'checkbox', checked: v === '1', onchange: function () { set(cb.checked ? '1' : ''); refrescar(); } });
        agregar(f, h('div', { class: 'sec', style: { marginTop: '16px' } }, h('label', { class: 'chk', title: 'Añade: ' + c.def }, cb, h('span', { text: c.etiqueta }))));
        return;
      }
      var comp;
      if (c.tipo === 'largo') {
        comp = h('textarea', { class: 'in', rows: 3, placeholder: 'Escribe aquí...', value: v });
        comp.addEventListener('input', function () { set(comp.value); autoAlto(comp); refrescar(); });
        setTimeout(function () { autoAlto(comp); }, 0);
      } else if (c.tipo === 'opciones') {
        var id = 'op-' + uid();
        var lista = h('datalist', { id: id });
        c.opciones.forEach(function (o) { if (o) lista.appendChild(h('option', { value: o })); });
        comp = h('div', null, entrada(v, 'Elige o escribe (puede quedar vacío)', set, { list: id }), lista);
      } else {
        comp = entrada(v, c.tipo === 'nacimiento' ? 'dd/mm/aaaa' : c.tipo === 'hora' ? 'hh:mm (p. ej. 10:26)' : '', set);
      }
      agregar(f, seccion(c.etiqueta, comp, 18));
      if (c.tipo === 'nacimiento') agregar(f, ui.infoNac = h('div', { class: 'info' }));
      if (c.tipo === 'hora') hayHora = true;
    });
    if (hayHora) agregar(f, ui.infoDur = h('div', { class: 'info' }));

    agregar(f, seccion('Ticket', entrada(F.ticket, 'Pega aquí el enlace del ticket-logs', function (v) { F.ticket = v; })));
    agregar(f, seccion('Pruebas (opcional)', entrada(F.pruebas, 'Enlaces o "Adjunto multimedia"', function (v) { F.pruebas = v; }), 18));
    ui.scrollForm.scrollTop = scroll;
  }
  function autoAlto(t) { t.style.height = 'auto'; t.style.height = Math.max(72, t.scrollHeight + 2) + 'px'; }

  function pintarUsuarios() {
    ui.usuarios.innerHTML = '';
    F.usuarios.forEach(function (u, i) {
      agregar(ui.usuarios, h('div', { class: 'usuario' },
        entrada(u.nick, 'Nick / usuario', function (v) { u.nick = v; }),
        entrada(u.id, 'ID de Discord', function (v) { u.id = v; }, { title: 'Clic derecho sobre el usuario en Discord > Copiar ID' }),
        entrada(u.sancion, 'Sanción propia (opcional)', function (v) { u.sancion = v; }, { title: 'Déjalo vacío para usar la sanción general' }),
        h('button', { class: 'x', title: 'Quitar usuario', html: '&times;', onclick: function () {
          if (F.usuarios.length === 1) F.usuarios[0] = { nick: '', id: '', sancion: '' }; else F.usuarios.splice(i, 1);
          pintarUsuarios(); refrescar();
        } })));
    });
  }

  function pintarReglas() {
    var q = M.slug(F.filtro || ''), crudo = (F.filtro || '').trim(), sec = M.secciones(D.reglamento);
    ui.reglas.innerHTML = '';
    var n = 0;
    reglas().forEach(function (r) {
      var k = M.claveRegla(r), txt = M.slug(r.numero + ' ' + r.motivo + ' regla');
      var ok = !crudo || F.sel[k] || r.numero === crudo || (!/^\d+$/.test(crudo) && txt.indexOf(q) >= 0);
      if (!ok) return;
      n++;
      var s = sec[r.numero];
      var cb = h('input', { type: 'checkbox', checked: !!F.sel[k], onchange: function () { if (cb.checked) F.sel[k] = true; else delete F.sel[k]; refrescar(); } });
      agregar(ui.reglas, h('label', { class: 'chk', title: s ? 'Regla ' + r.numero + '. ' + s[0] + '\n\n' + s[1].slice(0, 500) : null }, cb,
        h('span', null, h('b', { text: 'Regla ' + r.numero }), ' · ' + r.motivo)));
    });
    if (!n) agregar(ui.reglas, h('div', { class: 'hint', style: { fontStyle: 'italic' }, text: 'Ninguna regla coincide.' }));
  }

  // ================================================================ vista previa
  var ultimo = '';
  function refrescar() {
    if (!actual) return;
    var e = estado();
    camposAct.forEach(function (c) {
      var v = F.valores[c.clave], def = c.tipo === 'casilla' ? '' : c.def;
      if (v == null || v === def) delete memoria[c.clave]; else memoria[c.clave] = v;
    });
    var der = M.derivados(e);
    if (ui.infoNac) {
      var c = camposAct.filter(function (x) { return x.tipo === 'nacimiento'; })[0];
      var raw = F.valores[c.clave];
      if (M.vacio(raw)) { ui.infoNac.className = 'info'; ui.infoNac.textContent = 'Escribe la fecha para calcular edad y días de ban.'; }
      else if (!M.parseFecha(raw)) { ui.infoNac.className = 'info err'; ui.infoNac.textContent = 'Formato no válido. Usa dd/mm/aaaa'; }
      else {
        ui.infoNac.className = 'info ' + (der._yaTiene13 ? 'warn' : 'ok');
        ui.infoNac.textContent = 'Edad: ' + der.edad + ' años  ·  Ban: ' + der.dias13 + ' días  ·  Hasta el ' + der.fecha13 + (der._yaTiene13 ? '  (ya tiene 13 o más)' : '');
      }
    }
    if (ui.infoDur) {
      ui.infoDur.className = 'info' + (der.duracion ? ' ok' : '');
      ui.infoDur.textContent = der.duracion ? 'Tiempo conectado: ' + der.duracion : 'Escribe ambas horas (hh:mm) para calcular el tiempo conectado.';
    }
    ultimo = M.generar(e);
    pintarMensaje(ui.msg, ultimo, e);
    var n = M.limpiar(ultimo).length;
    ui.contador.textContent = n + ' / 2000';
    ui.contador.className = 'contador' + (n > 2000 ? ' mal' : '');
  }
  function nicksDe(e) { var n = {}; e.usuarios.forEach(function (u) { if (u.id) n[u.id] = (u.nick || '').trim(); }); return n; }
  function pintarMensaje(cont, texto, e) {
    var p = D.perfil, d = new Date();
    cont.innerHTML = '';
    agregar(cont, [avatar(p.nombre, p.color, 40),
      h('div', { class: 'cuerpo' },
        h('div', { class: 'cab' }, h('span', { class: 'autor', style: { color: p.color }, text: p.nombre || 'Moderador' }),
          p.rol ? h('span', { class: 'rol', text: p.rol }) : null,
          h('span', { class: 'hora', text: 'hoy a las ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) })),
        h('div', { class: 'md', html: M.markdown(texto, nicksDe(e)) }))]);
  }

  function aviso(t, color) {
    ui.aviso.textContent = t; ui.aviso.style.color = color;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(function () { ui.aviso.textContent = ''; }, 3500);
  }
  function copiar() {
    refrescar();
    var faltan = M.faltantes(ultimo);
    var seguir = faltan.length
      ? confirmar('Faltan datos', 'Hay campos sin rellenar:\n' + faltan.map(function (x) { return '• ' + x; }).join('\n') + '\n\n¿Copiar la nota igualmente? (esas partes se quedarán vacías)', 'Copiar igualmente')
      : Promise.resolve(true);
    seguir.then(function (ok) {
      if (!ok) return;
      var limpio = M.limpiar(ultimo);
      copiarTexto(limpio).then(function () {
        api('nota', { texto: limpio, plantilla: actual ? actual.nombre : '' }).catch(function (e) { toast('La nota se copió, pero no se guardó en el registro: ' + e.message, 'var(--amar)'); });
        if (limpio.length > 2000) aviso('Copiada, pero supera 2000 caracteres: Discord sin Nitro no la aceptará.', 'var(--amar)');
        else aviso('¡Nota copiada al portapapeles! Ya puedes pegarla en Discord.', 'var(--verde)');
      }, function () { alerta('No se pudo copiar', 'Tu navegador bloqueó el portapapeles. Selecciona el texto de la vista previa y cópialo a mano.'); });
    });
  }

  function nuevaNota() {
    var hay = F.usuarios.some(function (u) { return u.nick || u.id; });
    (hay ? confirmar('Nueva nota', 'Se vaciará el formulario actual. ¿Continuar?', 'Vaciar', true) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      memoria = {};
      F.usuarios = [{ nick: '', id: '', sancion: '' }]; F.nombre = ''; F.ticket = ''; F.pruebas = ''; F.prefijo = 'Apodos:'; F.filtro = '';
      if (actual) cargarPlantilla(actual);
      var n = $('.usuario input', ui.form); if (n) n.focus();
    });
  }

  // ================================================================ modales
  function modal(titulo, contenido, botones, opts) {
    opts = opts || {};
    return new Promise(function (resolver) {
      var fondo, caja;
      function cerrar(i) { document.removeEventListener('keydown', tecla, true); fondo.remove(); resolver(i); }
      function tecla(e) {
        if (e.key === 'Escape') { e.stopPropagation(); cerrar(-1); }
        if (e.key === 'Enter' && opts.enter != null && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); cerrar(opts.enter); }
      }
      var pie = h('div', { class: 'pie' });
      (botones || []).forEach(function (b, i) {
        var boton = h('button', { class: 'btn ' + (b.c || ''), text: b.t, onclick: function () {
          if (b.accion) { var r = b.accion(); if (r === false) return; }
          cerrar(i);
        } });
        if (b.izq) boton.classList.add('izq');
        pie.appendChild(boton);
      });
      caja = h('div', { class: 'modal', style: { width: opts.ancho || '460px' } },
        titulo ? h('h3', { text: titulo }) : null, h('div', { class: 'contenido' }, contenido), botones && botones.length ? pie : null);
      fondo = h('div', { class: 'fondo-modal', onmousedown: function (e) { if (e.target === fondo && !opts.fijo) cerrar(-1); } }, caja);
      document.body.appendChild(fondo);
      document.addEventListener('keydown', tecla, true);
      var foco = caja.querySelector('input,textarea'); if (foco) setTimeout(function () { foco.focus(); }, 30);
      if (opts.alAbrir) opts.alAbrir(caja, cerrar);
    });
  }
  function parrafo(t) { return h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' }, text: t }); }
  function confirmar(titulo, texto, si, peligro) {
    return modal(titulo, parrafo(texto), [{ t: 'Cancelar', c: 'plano' }, { t: si, c: peligro ? 'rojo' : '' }], { enter: 1 }).then(function (i) { return i === 1; });
  }
  function alerta(titulo, texto) { return modal(titulo, parrafo(texto), [{ t: 'Entendido' }], { enter: 0 }); }

  // ---------------------------------------------------------------- perfil
  function editarPerfil() {
    var p = D.perfil;
    var n = h('input', { class: 'in', value: p.nombre }), r = h('input', { class: 'in', value: p.rol, placeholder: 'p. ej. Ayudantes [AUE]' });
    var c = h('input', { type: 'color', value: p.color, style: { width: '64px', height: '38px', border: '0', background: 'none', cursor: 'pointer' } });
    modal('Perfil', h('div', null, h('span', { class: 'lbl', text: 'Nombre visible' }), h('div', { style: { height: '8px' } }), n,
      h('span', { class: 'lbl', style: { marginTop: '16px' }, text: 'Rol (opcional)' }), h('div', { style: { height: '8px' } }), r,
      h('span', { class: 'lbl', style: { marginTop: '16px' }, text: 'Color del nombre' }), h('div', { style: { height: '8px' } }), c,
      h('div', { class: 'hint', text: 'Solo cambia cómo te ves en la vista previa.' })),
      [{ t: 'Cancelar', c: 'plano' }, { t: 'Guardar' }], { enter: 1 }).then(function (i) {
      if (i !== 1) return;
      D.perfil = { nombre: n.value.trim() || 'Moderador', rol: r.value.trim(), color: c.value };
      guardar(); pintarUsuario(); refrescar();
    });
  }

  // ---------------------------------------------------------------- reglas
  function editarReglas() {
    var ta = h('textarea', { class: 'in mono', rows: 16, value: D.reglas.join('\n'), style: { width: '560px', maxWidth: '100%' } });
    modal('Lista de reglas', h('div', null, h('div', { class: 'hint', style: { marginBottom: '8px' }, text: 'Una regla por línea con el formato:  número | motivo' }), ta),
      [{ t: 'Restaurar', c: 'plano', izq: true, accion: function () { ta.value = DEF.reglas.join('\n'); return false; } }, { t: 'Cancelar', c: 'plano' }, { t: 'Guardar' }], { ancho: '620px' })
      .then(function (i) {
        if (i !== 2) return;
        D.reglas = ta.value.split('\n').map(M.parseRegla).filter(Boolean).map(M.textoRegla);
        guardar(true); pintarReglas(); refrescar();
      });
  }

  // ---------------------------------------------------------------- reglamento
  function verReglamento() {
    var cont = h('div', { class: 'md', style: { whiteSpace: 'pre-wrap' } });
    function pintar() { cont.innerHTML = M.markdown(D.reglamento, {}); cont.style.zoom = D.zoomRegl / 100; }
    pintar();
    var z = zoomControl(D.zoomRegl, function (v) { D.zoomRegl = v; guardar(); pintar(); });
    var sc = h('div', { style: { maxHeight: '62vh', overflow: 'auto', paddingRight: '8px' } }, cont);
    rueda(sc, z);
    modal('Reglamento del servidor', h('div', null, h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' } }, z), sc),
      ADMIN ? [{ t: 'Editar texto', c: 'plano', izq: true }, { t: 'Cerrar' }] : [{ t: 'Cerrar' }], { ancho: '820px' }).then(function (i) {
      if (ADMIN && i === 0) editarReglamento();
    });
  }
  function editarReglamento() {
    var ta = h('textarea', { class: 'in mono', value: D.reglamento, style: { width: '100%', height: '56vh' } });
    modal('Editar reglamento', h('div', null, h('div', { class: 'hint', style: { marginBottom: '8px' }, text: 'Usa "## N. Título" para cada regla: así se enlaza con las casillas de reglas.' }), ta),
      [{ t: 'Restaurar original', c: 'plano', izq: true, accion: function () { ta.value = DEF.reglamento; return false; } }, { t: 'Cancelar', c: 'plano' }, { t: 'Guardar' }], { ancho: '860px' })
      .then(function (i) {
        if (i !== 2) return;
        D.reglamento = ta.value; guardar(true); pintarReglas(); verReglamento();
      });
  }

  // ---------------------------------------------------------------- historial
  function verHistorial(equipo) {
    var lista = h('div', { style: { maxHeight: '58vh', overflow: 'auto', paddingRight: '8px' } });
    var buscar = h('input', { class: 'in', placeholder: equipo ? 'Buscar por texto, ID o moderador...' : 'Buscar en mis notas (texto, ID, usuario)...' });
    var autor = h('select', { class: 'in', style: { width: '220px' } }, h('option', { value: '', text: 'Todo el staff' }));
    var info = h('div', { class: 'hint' });
    var ultimas = [];
    if (equipo) api('staff', {}).then(function (r) { r.staff.forEach(function (p) { autor.appendChild(h('option', { value: p.id, text: p.nombre })); }); });
    function cargar() {
      info.textContent = 'Cargando...';
      api('notas', { equipo: !!equipo, q: buscar.value, autorId: autor.value }).then(function (r) {
        ultimas = r.notas;
        lista.innerHTML = '';
        info.textContent = r.total ? (r.total + ' nota(s)' + (r.total > r.notas.length ? ', mostrando las ' + r.notas.length + ' más recientes' : '')) : '';
        if (!r.notas.length) agregar(lista, h('div', { class: 'hint', text: buscar.value || autor.value ? 'No hay notas que coincidan.' : 'Todavía no hay notas guardadas. Se guardan al pulsar "Copiar nota".' }));
        r.notas.forEach(function (x) {
          var d = new Date(x.fecha);
          agregar(lista, h('div', { class: 'hist' },
            h('div', { class: 'f' },
              h('span', null, equipo ? h('b', { style: { color: 'var(--tit)' }, text: x.autor + '  ' }) : null, d.toLocaleString('es-ES'), x.plantilla ? '  ·  ' + x.plantilla : ''),
              h('span', null,
                h('button', { class: 'btn sec peq', text: 'Copiar', onclick: function () { copiarTexto(x.texto).then(function () { toast('Copiada'); }); } }), ' ',
                h('button', { class: 'btn rojo peq', text: 'Borrar', onclick: function () {
                  confirmar('Borrar nota', '¿Borrar esta nota del registro?', 'Borrar', true).then(function (ok) {
                    if (ok) api('borrarNota', { id: x.id }).then(cargar, function (e) { toast(e.message, 'var(--rojo)'); });
                  });
                } }))),
            h('div', { class: 'md', style: { fontSize: '13.5px' }, html: M.markdown(x.texto, {}) })));
        });
      }, function (e) { info.textContent = 'Error: ' + e.message; });
    }
    var t;
    buscar.addEventListener('input', function () { clearTimeout(t); t = setTimeout(cargar, 300); });
    autor.addEventListener('change', cargar);
    cargar();
    modal(equipo ? 'Registro de notas del equipo' : 'Mis notas', h('div', null,
      h('div', { class: 'row', style: { marginBottom: '8px' } }, h('div', { class: 'grow' }, buscar), equipo ? autor : null), info, lista), [
      { t: 'Exportar .txt', c: 'sec', izq: true, accion: function () {
        descargar(equipo ? 'registro-notas-equipo.txt' : 'mis-notas.txt', ultimas.map(function (x) {
          return '===== ' + new Date(x.fecha).toLocaleString('es-ES') + ' · ' + x.autor + (x.plantilla ? ' · ' + x.plantilla : '') + ' =====\n' + x.texto;
        }).join('\n\n'), 'text/plain');
        return false;
      } },
      { t: 'Cerrar' }], { ancho: '860px' });
  }

  // ---------------------------------------------------------------- copia de seguridad
  function respaldo() {
    var archivo = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    archivo.addEventListener('change', function () {
      var f = archivo.files[0]; if (!f) return;
      f.text().then(function (t) {
        var d;
        try { d = JSON.parse(t); } catch (e) { alerta('Archivo no válido', 'No es un JSON de Notas de Moderación.'); return; }
        if (!d || !Array.isArray(d.plantillas) || !Array.isArray(d.formatos)) { alerta('Archivo no válido', 'Le faltan plantillas o formatos.'); return; }
        confirmar('Importar configuración', 'Se reemplazarán tus plantillas, formatos, reglas y reglamento por los del archivo. ¿Continuar?', 'Importar', true).then(function (ok) {
          if (!ok) return;
          ['plantillas', 'formatos', 'reglas', 'reglamento'].forEach(function (k) { if (d[k] != null) D[k] = d[k]; });
          D.plantillas.forEach(function (p) { p.id = p.id || uid(); });
          D.formatos.forEach(function (p) { p.id = p.id || uid(); });
          guardar(true); fondoCerrar(); arrancar(); toast('Configuración importada');
        });
      });
    });
    var fondoCerrar = function () { var f = document.querySelector('.fondo-modal'); if (f) f.remove(); };
    modal('Copia de seguridad', h('div', null,
      parrafo('Las plantillas, formatos, reglas y reglamento del equipo se guardan en la base de datos y los ve todo el staff. Exporta un archivo para tener una copia de seguridad o importar una configuración.'),
      archivo),
      [{ t: 'Restaurar todo a lo original', c: 'plano', izq: true, accion: function () {
        confirmar('Restaurar', 'Se perderán tus plantillas y formatos personalizados. ¿Continuar?', 'Restaurar', true).then(function (ok) {
          if (!ok) return;
          var perfil = D.perfil; D = porDefecto(); D.perfil = perfil; guardar(true); fondoCerrar(); arrancar();
        });
        return false;
      } },
      { t: 'Importar...', c: 'sec', accion: function () { archivo.click(); return false; } },
      { t: 'Exportar', accion: function () {
        descargar('notas-moderacion-config.json', JSON.stringify({ plantillas: D.plantillas, formatos: D.formatos, reglas: D.reglas, reglamento: D.reglamento }, null, 2));
        return false;
      } },
      { t: 'Cerrar', c: 'plano' }], { ancho: '640px' });
  }

  // ---------------------------------------------------------------- editor de plantillas
  function editorPlantillas(crear) {
    var sel = actual ? D.plantillas.indexOf(actual) : 0;
    var items = h('div', { class: 'items' });
    var nombre = h('input', { class: 'in' }), rg = h('input', { class: 'in', placeholder: '10 | Uso de programas externos ; 1 | Faltas de respeto' }),
      sa = h('input', { class: 'in', placeholder: 'Ban, Nota, Advertencia...' }), cu = h('textarea', { class: 'in mono', style: { height: '330px' } });
    function p() { return D.plantillas[sel]; }
    function pintarLista() {
      items.innerHTML = '';
      D.plantillas.forEach(function (x, i) {
        agregar(items, h('div', { class: 'item' + (i === sel ? ' sel' : ''), title: x.nombre, text: '#  ' + M.slug(x.nombre), onclick: function () { sel = i; mostrar(); } }));
      });
    }
    function mostrar() {
      pintarLista();
      var x = p();
      [nombre, rg, sa, cu].forEach(function (e) { e.disabled = !x; });
      nombre.value = x ? x.nombre : ''; rg.value = x ? x.reglas : ''; sa.value = x ? x.sancion : ''; cu.value = x ? x.cuerpo : '';
    }
    nombre.addEventListener('input', function () { if (p()) { p().nombre = nombre.value || 'Sin nombre'; pintarLista(); } });
    rg.addEventListener('input', function () { if (p()) p().reglas = rg.value; });
    sa.addEventListener('input', function () { if (p()) p().sancion = sa.value; });
    cu.addEventListener('input', function () { if (p()) p().cuerpo = cu.value; });
    function nueva(base) {
      var n = base ? { id: uid(), nombre: base.nombre + ' (copia)', reglas: base.reglas, sancion: base.sancion, cuerpo: base.cuerpo }
        : { id: uid(), nombre: 'Nueva plantilla', reglas: '10 | Arruinar la experiencia de juego', sancion: 'Nota', cuerpo: 'Se genera un reporte por {{Motivo}}.\n\n{{Desarrollo|largo}}\n[conclusión]\n{{Conclusión|largo}}' };
      D.plantillas.push(n); sel = D.plantillas.length - 1; mostrar(); nombre.focus(); nombre.select();
    }
    var cont = h('div', { class: 'grande' },
      h('div', { class: 'lista-izq' }, h('div', { class: 'titulo' }, h('span', { class: 'lbl', text: 'Plantillas' })), items,
        h('div', { class: 'botones' },
          h('button', { class: 'btn peq', text: 'Nueva', onclick: function () { nueva(null); } }),
          h('button', { class: 'btn sec peq', text: 'Duplicar', onclick: function () { if (p()) nueva(p()); } }),
          h('button', { class: 'btn sec peq', text: 'Subir', onclick: function () { if (sel > 0) { var t = D.plantillas.splice(sel, 1)[0]; D.plantillas.splice(--sel, 0, t); mostrar(); } } }),
          h('button', { class: 'btn sec peq', text: 'Bajar', onclick: function () { if (sel < D.plantillas.length - 1) { var t = D.plantillas.splice(sel, 1)[0]; D.plantillas.splice(++sel, 0, t); mostrar(); } } }),
          h('button', { class: 'btn rojo peq', style: { gridColumn: 'span 2' }, text: 'Eliminar', onclick: function () {
            if (!p()) return;
            confirmar('Eliminar plantilla', '¿Eliminar "' + p().nombre + '"?', 'Eliminar', true).then(function (ok) {
              if (!ok) return; D.plantillas.splice(sel, 1); sel = Math.max(0, sel - 1); mostrar();
            });
          } }))),
      h('div', { class: 'col-edit' },
        h('span', { class: 'lbl', text: 'Nombre' }), nombre,
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
          h('div', null, h('span', { class: 'lbl', text: 'Reglas (separadas por ;)' }), rg),
          h('div', null, h('span', { class: 'lbl', text: 'Sanción por defecto' }), sa)),
        h('span', { class: 'lbl', text: 'Cuerpo de la nota' }), cu,
        h('div', { class: 'ayuda-sintaxis', html:
          '<b>Sintaxis</b><br><code>{{Sala}}</code> campo de una línea · <code>{{Testimonio|largo}}</code> área de texto · <code>{{Motivo|=texto por defecto}}</code> valor inicial<br>' +
          '<code>{{Resultado|opciones:A;B;C}}</code> lista · <code>{{Verificación|casilla|=Frase}}</code> casilla que añade la frase<br>' +
          '<code>{{Fecha de nacimiento|nacimiento}}</code> calcula <code>{{edad}}</code>, <code>{{dias13}}</code>, <code>{{fecha13}}</code> · <code>{{Hora de ingreso|hora}}</code> + otra hora calculan <code>{{duracion}}</code><br>' +
          'Automáticos: <code>{{usuario}}</code> <code>{{id}}</code> <code>{{hoy}}</code> <code>{{fechacorta}}</code> · <code>{{Fecha|=@hoy}}</code> rellena la fecha de hoy<br>' +
          '<code>[[ ... ]]</code> bloque opcional (solo si sus campos están rellenos) · <code>[[ si |sino| alternativa ]]</code><br>' +
          'Una línea <code>[conclusión]</code> separa el desarrollo de la conclusión (el formato decide cómo se muestra cada parte).<br>' +
          'La cabecera, el nombre, el ticket y las pruebas los añade el formato.' })));
    if (crear) nueva(null); else mostrar();
    modal(null, cont, [
      { t: 'Restaurar predeterminadas', c: 'plano', izq: true, accion: function () {
        confirmar('Restaurar plantillas', 'Se volverán a añadir las plantillas originales que falten o se hayan modificado (se conservan tus plantillas nuevas).', 'Restaurar', true).then(function (ok) {
          if (!ok) return;
          DEF.plantillas.forEach(function (o) {
            var ex = D.plantillas.filter(function (x) { return x.nombre === o.nombre; })[0];
            if (ex) { ex.reglas = o.reglas; ex.sancion = o.sancion; ex.cuerpo = o.cuerpo; }
            else D.plantillas.push({ id: uid(), nombre: o.nombre, reglas: o.reglas, sancion: o.sancion, cuerpo: o.cuerpo });
          });
          mostrar();
        });
        return false;
      } },
      { t: 'Guardar y cerrar', c: 'verde' }], { ancho: 'auto', fijo: true }).then(function () {
      guardar(true);
      var sigue = actual && D.plantillas.indexOf(actual) >= 0 ? actual : (p() || D.plantillas[0]);
      pintarCanales();
      if (sigue) cargarPlantilla(sigue);
    });
  }

  // ---------------------------------------------------------------- formatos
  function organizarFormatos() {
    var sel = Math.max(0, D.formatos.indexOf(formatoActual())), bSel = 0, arrastre = -1;
    var items = h('div', { class: 'items' }), bloques = h('div', { class: 'bloques' });
    var nombre = h('input', { class: 'in' }), ta = h('textarea', { class: 'in mono', rows: 6, placeholder: 'Texto del bloque, p. ej. **Conclusión:**  y debajo  {conclusion|- }' });
    var previa = h('div', { class: 'msg' }), scPrev = h('div', { class: 'scroll' }, previa);
    var zp = zoomControl(D.zoomVista, function (v) { previa.style.zoom = v / 100; });
    rueda(scPrev, zp);
    previa.style.zoom = D.zoomVista / 100;
    function f() { return D.formatos[sel]; }
    function pintarLista() {
      items.innerHTML = '';
      D.formatos.forEach(function (x, i) {
        agregar(items, h('div', { class: 'item' + (i === sel ? ' sel' : ''), text: x.nombre + (x.id === formatoActual().id ? '   (en uso)' : ''), onclick: function () { sel = i; bSel = 0; mostrar(); } }));
      });
    }
    function pintarBloques() {
      bloques.innerHTML = '';
      if (!f()) return;
      f().bloques.forEach(function (b, i) {
        var el = h('div', { class: 'bloque' + (i === bSel ? ' sel' : ''), draggable: 'true', title: 'Arrastra para reordenar',
          onclick: function () { bSel = i; pintarBloques(); mostrarBloque(); } },
          h('span', { class: 'asa', html: '&#8942;&#8942;' }), h('span', { text: (i + 1) + '.' }),
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' }, text: b.replace(/\n/g, '  /  ') }));
        el.addEventListener('dragstart', function (e) { arrastre = i; el.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (x) {} });
        el.addEventListener('dragend', function () { el.classList.remove('arrastrando'); });
        el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('sobre'); });
        el.addEventListener('dragleave', function () { el.classList.remove('sobre'); });
        el.addEventListener('drop', function (e) {
          e.preventDefault(); el.classList.remove('sobre');
          if (arrastre < 0 || arrastre === i) return;
          var t = f().bloques.splice(arrastre, 1)[0]; f().bloques.splice(i, 0, t); bSel = i; arrastre = -1;
          pintarBloques(); mostrarBloque(); previo();
        });
        bloques.appendChild(el);
      });
    }
    function mostrarBloque() { var b = f() && f().bloques[bSel]; ta.value = b || ''; ta.disabled = b == null; }
    function mostrar() { pintarLista(); nombre.value = f() ? f().nombre : ''; pintarBloques(); mostrarBloque(); previo(); }
    function previo() { var e = estado(); e.formato = f() || { bloques: [] }; pintarMensaje(previa, M.generar(e), e); }
    function mover(d) { var j = bSel + d; if (!f() || j < 0 || j >= f().bloques.length) return; var b = f().bloques; var t = b[bSel]; b[bSel] = b[j]; b[j] = t; bSel = j; pintarBloques(); previo(); }
    nombre.addEventListener('input', function () { if (f()) { f().nombre = nombre.value || 'Sin nombre'; pintarLista(); } });
    ta.addEventListener('input', function () {
      if (!f() || f().bloques[bSel] == null) return;
      f().bloques[bSel] = ta.value.replace(/\n[ \t]*\n+/g, '\n'); pintarBloques(); previo();
    });
    function nuevo(base) {
      var n = { id: uid(), nombre: base ? base.nombre + ' (copia)' : 'Nuevo formato', bloques: (base || DEF.formatos[0]).bloques.slice() };
      D.formatos.push(n); sel = D.formatos.length - 1; bSel = 0; mostrar(); nombre.focus(); nombre.select();
    }
    var chips = h('div', { class: 'chips' });
    M.MARCADORES.forEach(function (m) {
      agregar(chips, h('button', { class: 'btn sec', title: m[1], text: '{' + m[0] + '}', onclick: function () {
        if (!f()) return;
        if (f().bloques[bSel] == null) { f().bloques.push(''); bSel = f().bloques.length - 1; }
        var a = ta.selectionStart, z = ta.selectionEnd, ins = '{' + m[0] + '}';
        ta.disabled = false;
        ta.value = ta.value.slice(0, a) + ins + ta.value.slice(z);
        ta.selectionStart = ta.selectionEnd = a + ins.length;
        ta.dispatchEvent(new Event('input')); ta.focus();
      } }));
    });
    var cont = h('div', { class: 'grande tres' },
      h('div', { class: 'lista-izq' }, h('div', { class: 'titulo' }, h('span', { class: 'lbl', text: 'Formatos' })), items,
        h('div', { class: 'botones' },
          h('button', { class: 'btn peq', text: 'Nuevo', onclick: function () { nuevo(null); } }),
          h('button', { class: 'btn sec peq', text: 'Duplicar', onclick: function () { if (f()) nuevo(f()); } }),
          h('button', { class: 'btn verde peq', text: 'Usar este', onclick: function () { if (f()) { D.formatoActual = f().id; guardar(); pintarLista(); } } }),
          h('button', { class: 'btn rojo peq', text: 'Eliminar', onclick: function () {
            if (!f()) return;
            if (D.formatos.length <= 1) { alerta('Eliminar formato', 'Debe quedar al menos un formato.'); return; }
            confirmar('Eliminar formato', '¿Eliminar "' + f().nombre + '"?', 'Eliminar', true).then(function (ok) {
              if (!ok) return; D.formatos.splice(sel, 1); sel = 0; bSel = 0; mostrar();
            });
          } }))),
      h('div', { class: 'col-edit' },
        h('span', { class: 'lbl', text: 'Nombre del formato' }), nombre,
        h('span', { class: 'lbl', text: 'Bloques (arrastra para ordenar)' }), bloques,
        h('div', { class: 'row', style: { marginTop: '8px' } },
          h('button', { class: 'btn sec peq', text: 'Subir', onclick: function () { mover(-1); } }),
          h('button', { class: 'btn sec peq', text: 'Bajar', onclick: function () { mover(1); } }),
          h('button', { class: 'btn peq', text: '+ Añadir bloque', onclick: function () {
            if (!f()) return; var i = Math.min(bSel + 1, f().bloques.length); f().bloques.splice(i, 0, '**Nuevo bloque:**'); bSel = i;
            pintarBloques(); mostrarBloque(); previo(); ta.focus(); ta.select();
          } }),
          h('button', { class: 'btn rojo peq', text: 'Quitar', onclick: function () {
            if (!f() || f().bloques[bSel] == null) return; f().bloques.splice(bSel, 1); bSel = Math.max(0, Math.min(bSel, f().bloques.length - 1));
            pintarBloques(); mostrarBloque(); previo();
          } })),
        h('span', { class: 'lbl', text: 'Contenido del bloque seleccionado' }), ta,
        h('span', { class: 'lbl', text: 'Insertar marcador' }), chips,
        h('div', { class: 'ayuda-sintaxis', html:
          'Cada bloque es un párrafo de la nota. Si todos sus marcadores están vacíos, el bloque no aparece (lo mismo con cada línea).<br><br>' +
          '<b>Prefijos:</b> <code>{cuerpo|&gt; }</code> pone el texto como cita; <code>{conclusion|- }</code> como viñeta. Los párrafos que ya empiezan con formato (**, __, -#, enlaces) se dejan tal cual.<br><br>' +
          '<b>Markdown de Discord:</b> **negrita**, *cursiva*, __subrayado__, -# texto pequeño, &gt; cita, - viñeta, # título.' })),
      h('div', { class: 'previa-col' },
        h('div', { class: 'pane-head' }, h('span', { class: 'lbl', text: 'Vista previa' }), zp), scPrev));
    mostrar();
    modal(null, cont, [
      { t: 'Restaurar formatos predeterminados', c: 'plano', izq: true, accion: function () {
        confirmar('Restaurar formatos', 'Se restauran Profesional, Clásico y Compacto (se conservan tus formatos nuevos).', 'Restaurar', true).then(function (ok) {
          if (!ok) return;
          DEF.formatos.forEach(function (o) {
            var ex = D.formatos.filter(function (x) { return x.nombre === o.nombre; })[0];
            if (ex) ex.bloques = o.bloques.slice(); else D.formatos.push({ id: uid(), nombre: o.nombre, bloques: o.bloques.slice() });
          });
          mostrar();
        });
        return false;
      } },
      { t: 'Guardar y cerrar', c: 'verde' }], { ancho: 'auto', fijo: true }).then(function () {
      guardar(true); pintarFormulario(); refrescar();
    });
  }

  // ================================================================ administración del staff
  function panelStaff() {
    var tabla = h('div');
    function mostrarCodigo(nombre, codigo) {
      return modal('Código de ' + nombre, h('div', null,
        parrafo('Entrégale este código. Ya funciona. Por seguridad solo se muestra ahora: guárdalo o cópialo antes de cerrar (si se pierde, puedes generar uno nuevo).'),
        h('div', { class: 'codigo', style: { fontSize: '22px', textAlign: 'center', margin: '16px 0', padding: '12px' }, text: codigo })),
        [{ t: 'Copiar código', c: 'sec', accion: function () { copiarTexto(codigo).then(function () { toast('Copiado'); }); return false; } }, { t: 'Listo' }], { fijo: true });
    }
    function error(e) { alerta('No se pudo completar', e.message); }
    function cargar() {
      api('staff', {}).then(function (r) {
        tabla.innerHTML = '';
        var t = h('table', { class: 'tabla' }, h('tr', null, h('th', { text: 'Nombre' }), h('th', { text: 'Código' }), h('th', { text: 'Rol' }), h('th', { text: 'Último acceso' }), h('th')));
        r.staff.forEach(function (p) {
          var yo = SES && p.id === SES.yo.id;
          var rol = h('select', { class: 'in', style: { width: '120px', padding: '5px 28px 5px 8px' }, onchange: function () {
            api('cambiarRol', { id: p.id, admin: rol.value === '1' }).then(function () { toast('Rol de ' + p.nombre + ' actualizado'); cargar(); }, function (e) { error(e); cargar(); });
          } }, h('option', { value: '1', text: 'Admin', selected: p.admin }), h('option', { value: '0', text: 'Staff', selected: !p.admin }));
          t.appendChild(h('tr', null,
            h('td', null, h('b', { text: p.nombre, style: { color: 'var(--tit)' } }), yo ? h('span', { class: 'hint', text: '  (tú)' }) : null),
            h('td', null, h('span', { class: 'codigo', text: p.final ? '••••-••••-••••-' + p.final : 'oculto' })),
            h('td', null, rol),
            h('td', { class: 'hint', text: p.ultimo ? new Date(p.ultimo).toLocaleString('es-ES') : 'nunca' }),
            h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
              h('button', { class: 'btn sec peq', text: 'Nuevo código', title: 'Genera otro código; el anterior deja de funcionar', onclick: function () {
                confirmar('Nuevo código', 'Se generará un código nuevo para ' + p.nombre + ' y el actual dejará de funcionar' + (yo ? ' (tendrás que entrar con el nuevo)' : '') + '.', 'Generar', true).then(function (ok) {
                  if (ok) api('regenerar', { id: p.id }).then(function (r2) { return mostrarCodigo(p.nombre, r2.codigo); }).then(function () { if (yo) SES.salir(); else cargar(); }, error);
                });
              } }), ' ',
              h('button', { class: 'btn rojo peq', text: 'Revocar', onclick: function () {
                confirmar('Revocar acceso', 'Se quitará el acceso de ' + p.nombre + ' al momento: su código deja de funcionar y se cierran sus sesiones abiertas. Sus notas del registro se conservan.', 'Revocar', true).then(function (ok) {
                  if (ok) api('revocar', { id: p.id }).then(function () { toast(p.nombre + ' ya no tiene acceso'); if (yo) SES.salir(); else cargar(); }, error);
                });
              } }))));
        });
        tabla.appendChild(t);
      }, error);
    }
    function anadir() {
      var n = h('input', { class: 'in', placeholder: 'p. ej. Juanito' });
      var adm = h('input', { type: 'checkbox' });
      modal('Añadir miembro del staff', h('div', null, h('span', { class: 'lbl', text: 'Nombre' }), h('div', { style: { height: '8px' } }), n,
        h('label', { class: 'chk', style: { marginTop: '14px' } }, adm, h('span', { text: 'Administrador (gestiona staff, plantillas y ve el registro del equipo)' }))),
        [{ t: 'Cancelar', c: 'plano' }, { t: 'Crear código' }], { enter: 1 }).then(function (i) {
        if (i !== 1 || !n.value.trim()) return;
        api('crearStaff', { nombre: n.value.trim(), admin: adm.checked }).then(function (r) { cargar(); return mostrarCodigo(r.miembro.nombre, r.codigo); }, error);
      });
    }
    cargar();
    modal('Gestión del staff', h('div', { style: { width: 'min(900px, 92vw)' } },
      parrafo('Cada persona entra con su propio código. Los cambios son inmediatos: un código nuevo funciona al momento y uno revocado deja de funcionar al instante.'),
      h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '16px 0 8px' } }, h('span', { class: 'lbl', text: 'Miembros con acceso' }),
        h('button', { class: 'btn peq', text: '+ Añadir miembro', onclick: anadir })),
      tabla), [{ t: 'Cerrar', c: 'sec' }], { ancho: 'auto' });
  }

  function cerrarSesion() {
    confirmar('Cerrar sesión', 'Se olvidará tu código en este dispositivo. Tus plantillas se mantienen.', 'Cerrar sesión', true).then(function (ok) {
      if (!ok) return;
      if (SES) SES.salir(true); else location.reload();
    });
  }

  // ================================================================ arranque
  function arrancar() {
    if (D.formatoActual == null && D.formatos[0]) D.formatoActual = D.formatos[0].id;
    montar();
    var p = (actual && D.plantillas.filter(function (x) { return x.id === actual.id; })[0]) || D.plantillas[0];
    if (p) cargarPlantilla(p);
  }
  arrancar();
})();
