import { esc } from './ordenesCompraUi.js';
import { http, formatDate, formatNumber, openOverlay, closeOverlay, showToast } from '../utils.js';

const cantidadValida = (n, original) => Number.isInteger(n) && n >= Math.max(1, original) && n <= 2147483647;
const categoria = (p) => {
  const name = String(p.categoria ?? '').trim().toLowerCase();
  if (['cuadro', 'cuadros'].includes(name)) return 'Cuadros';
  if (['anuario', 'anuarios', 'book', 'books'].includes(name)) return 'Book';
  return p.categoria || 'Sin categoría';
};
// Borrador de esta pestaña: sobrevive a la navegación SPA, sin persistir compras.
const contratosBorrador = new Map();

export async function init() {
  const el = (id) => document.getElementById(id);
  const form = el('contratoForm');
  const input = el('colegioBusqueda');
  const resultados = el('colegioResultados');
  const estadoBusqueda = el('colegioBusquedaEstado');
  const reintentar = el('colegioReintentar');
  const agregarColegio=el('colegioAgregar'),cancelarColegio=el('colegioCancelar'),buscadorPanel=el('colegioBuscadorPanel');
  let buscadorDesplegado=false;
  let listado = [];
  let cargandoListado = false;
  let busquedaAbierta = false;
  const estado = el('contratoEstado');
  const colegios = el('contratoColegios');
  const resumen = el('compraResumen');
  const revision = el('compraRevision');
  const confirmar = el('compraConfirmar');
  const preparar = el('compraPreparar');
  const editor = el('ordenEditor');
  let proveedores = [];
  const contratos = contratosBorrador;
  let pending = false;
  let token = null;
  let bloqueado = false;
  let guardado = false;
  let resumenValido = false;

  const esLiderBook = v => normalizar(v.razon_social).replace(/\s+/g, '') === 'liderbook';
  const proveedoresPara = p => proveedores.filter(v => categoria(p) === 'Book' ? esLiderBook(v) : categoria(p) === 'Cuadros' ? !esLiderBook(v) : true);
  function ajustarProveedores() {
    for (const c of contratos.values()) c.productos.forEach((p, index) => {
      const opciones = proveedoresPara(p), anuario = categoria(p) === 'Book';
      if (anuario) p.id_proveedor = opciones[0]?.id_proveedor ?? null;
      else if (!opciones.some(v => v.id_proveedor === p.id_proveedor)) p.id_proveedor = null;
      const card = colegios.querySelector(`[data-contrato="${c.id_contrato}"]`);
      const select = card?.querySelector(`[data-proveedor="${index}"]`);
      if (select) { select.value = p.id_proveedor ?? ''; select.disabled = bloqueado || anuario; }
    });
  }

  function setBloqueado(value) {
    bloqueado = value;
    actualizarBuscador();
    form.querySelectorAll('input, button').forEach((n) => { n.disabled = value || !proveedores.length || cargandoListado; });
    colegios.querySelectorAll('input, select, button').forEach((n) => { n.disabled = value; });
    ajustarProveedores();
    preparar.disabled = value || pending || !resumenValido;
    if (!value) filtrarColegios();
  }

  function renderOrdenes(ordenes) {
    const colegiosIncluidos = new Set();
    const unidadesTexto = n => `${formatNumber(n)} ${n === 1 ? 'unidad' : 'unidades'}`;
    const proveedoresRevision = ordenes.map(o => {
      const colegiosProveedor = new Map();
      for (const p of o.productos) for (const d of p.distribuciones) {
        colegiosIncluidos.add(d.id_contrato);
        if (!colegiosProveedor.has(d.id_contrato)) colegiosProveedor.set(d.id_contrato, { nombre: d.colegio, productos: [] });
        colegiosProveedor.get(d.id_contrato).productos.push({ modelo: p.modelo, cantidad: d.cantidad });
      }
      return { ...o, colegios: [...colegiosProveedor.values()], total: o.productos.reduce((s,p) => s + p.cantidad, 0) };
    });
    const total = proveedoresRevision.reduce((s,p) => s + p.total, 0);
    return `<p class="revision-resumen-linea">${colegiosIncluidos.size} ${colegiosIncluidos.size === 1 ? 'colegio' : 'colegios'} · ${proveedoresRevision.length} ${proveedoresRevision.length === 1 ? 'proveedor' : 'proveedores'} · ${unidadesTexto(total)}</p>
    <div class="revision-proveedores">${proveedoresRevision.map(o => `<details class="revision-proveedor">
      <summary class="revision-proveedor-header"><span class="revision-proveedor-nombre">${esc(o.razon_social)}</span><strong class="revision-proveedor-total">${unidadesTexto(o.total)}</strong><small>Ver detalle</small></summary>
      ${o.colegios.map(c => `<section class="revision-colegio"><h4>${esc(c.nombre)}</h4>
        <table class="table-custom revision-tabla"><thead><tr><th scope="col">Modelo</th><th scope="col">Cantidad</th></tr></thead>
        <tbody>${c.productos.map(p => `<tr><td>${esc(p.modelo)}</td><td>${formatNumber(p.cantidad)}</td></tr>`).join('')}</tbody></table>
      </section>`).join('')}
    </details>`).join('')}</div>`;
  }

  function actualizarResumen() {
    ajustarProveedores();
    token = null;
    revision.hidden = true;
    const productos = [...contratos.values()].flatMap(c => c.productos);
    el('pedidoIndicadorColegios').textContent=formatNumber(contratos.size);
    el('pedidoIndicadorProveedores').textContent=formatNumber(new Set(productos
      .filter(p=>p.cantidad_pedir>0&&proveedores.some(v=>v.id_proveedor===p.id_proveedor))
      .map(p=>p.id_proveedor)).size);
    el('pedidoIndicadorUnidades').textContent=formatNumber(productos.reduce((s,p)=>s+(Number.isInteger(p.cantidad_pedir)&&p.cantidad_pedir>=0&&p.cantidad_pedir<=2147483647?p.cantidad_pedir:0),0));
    const pedidos = new Map();
    let unidades = 0;
    for (const p of productos) {
      if (!cantidadValida(p.cantidad_pedir, p.cantidad)) continue;
      unidades += p.cantidad_pedir;
      const proveedor = proveedores.find(v => v.id_proveedor === p.id_proveedor);
      if (!proveedor) continue;
      const pedido = pedidos.get(proveedor.id_proveedor) || { nombre: proveedor.razon_social, cantidad: 0 };
      pedido.cantidad += p.cantidad_pedir;
      pedidos.set(proveedor.id_proveedor, pedido);
    }
    const asignados = productos.filter(p => proveedores.some(v => v.id_proveedor === p.id_proveedor)).length;
    el('compraAccionResumen').textContent = `${contratos.size} ${contratos.size === 1 ? 'colegio' : 'colegios'} · ${asignados} de ${productos.length} modelos asignados · ${formatNumber(unidades)} ${unidades === 1 ? 'unidad' : 'unidades'} a pedir`;
    const asignadas = [...pedidos.values()].reduce((s,p) => s + p.cantidad, 0);
    el('compraPedidosProveedor').innerHTML = [...pedidos.values()].map(p => `<div><dt>${esc(p.nombre)}</dt><dd>${formatNumber(p.cantidad)} ${p.cantidad === 1 ? 'unidad' : 'unidades'}</dd></div>`).join('');
    const invalidos = productos.filter((p) => !p.id_proveedor || !cantidadValida(p.cantidad_pedir, p.cantidad)).length;
    resumenValido = productos.length > 0 && invalidos === 0 && asignadas === unidades;
    resumen.hidden = !resumenValido;
    if (resumenValido) el('compraAccionResumen').textContent = `Total general: ${formatNumber(unidades)} ${unidades === 1 ? 'unidad' : 'unidades'}`;
    el('compraValidacionTexto').textContent = invalidos
      ? `${invalidos} ${invalidos === 1 ? 'modelo requiere' : 'modelos requieren'} proveedor o una cantidad válida. Las cantidades inválidas no se suman.`
      : resumenValido ? 'Pedido completo. Listo para preparar las órdenes.' : 'Revisa la asignación de unidades antes de preparar las órdenes.';
    el('compraValidacionIcono').hidden = !resumenValido;
    el('compraValidacion').classList.toggle('is-complete', resumenValido);
    preparar.disabled = bloqueado || pending || !resumenValido;
  }

  function actualizarTotal(c, card) {
    card.querySelector('[data-total]').textContent = c.productos.every((p) => cantidadValida(p.cantidad_pedir, p.cantidad)) ? `Total a solicitar: ${formatNumber(c.productos.reduce((s, p) => s + p.cantidad_pedir, 0))} unidades` : 'Revisa las cantidades';
  }

  function actualizarBuscador() {
    colegios.parentElement.hidden = contratos.size === 0;
    input.placeholder = contratos.size ? 'Buscar otro colegio...' : 'Buscar colegio por nombre...';
    buscadorPanel.querySelector('label').textContent = contratos.size ? 'Agregar otro colegio' : 'Agregar pedido';
    const abierto=!contratos.size||buscadorDesplegado;
    buscadorPanel.hidden=bloqueado||!abierto;
    agregarColegio.hidden=bloqueado||abierto;
    agregarColegio.disabled=pending||!proveedores.length;
    agregarColegio.setAttribute('aria-expanded',String(!buscadorPanel.hidden));
    cancelarColegio.hidden=!contratos.size;
    cancelarColegio.disabled=pending;
  }
  agregarColegio.addEventListener('click',()=>{buscadorDesplegado=true;actualizarBuscador();input.focus();});
  function cancelarBusqueda(){
    if(pending||!contratos.size)return;
    buscadorDesplegado=false;input.value='';cerrarBusqueda();actualizarBuscador();agregarColegio.focus();
  }
  cancelarColegio.addEventListener('click',cancelarBusqueda);
  function renderColegio(c) {
    const card = document.createElement('section');
    card.className = 'card-panel colegio-card';
    card.id = `colegio-${c.id_contrato}`;
    card.dataset.contrato = c.id_contrato;
    card.innerHTML = `<div class="panel-header colegio-header"><div><h2 class="panel-title">${esc(c.colegio)}</h2><p>${c.productos.length} ${c.productos.length===1?'modelo':'modelos'} · ${formatNumber(c.productos.reduce((s,p)=>s+p.cantidad,0))} unidades contratadas</p></div>
      <button type="button" class="btn-action btn-action-delete" data-quitar aria-label="Quitar ${esc(c.colegio)}"><i class="bi bi-trash" aria-hidden="true"></i> Quitar</button></div>
      <div class="table-scroll"><table class="table-custom compra-table"><thead><tr><th scope="col">Modelo</th><th scope="col">Contrato</th><th scope="col">A pedir</th><th scope="col">Proveedor</th></tr></thead><tbody>
      ${c.productos.map((producto,index) => {const p={...producto,index};return `<tr><td>${esc(p.modelo)}</td><td>${formatNumber(p.cantidad)}</td><td><div class="compra-cantidad-control"><button type="button" data-cantidad-step="-1" data-index="${p.index}" aria-label="Reducir cantidad: ${esc(p.modelo)}">−</button><input type="number" class="input-custom" data-cantidad="${p.index}" value="${p.cantidad_pedir}" min="${Math.max(1, p.cantidad)}" max="2147483647" step="1" aria-label="Cantidad a pedir: ${esc(p.modelo)}" aria-describedby="extra-${c.id_contrato}-${p.index}"><button type="button" data-cantidad-step="1" data-index="${p.index}" aria-label="Aumentar cantidad: ${esc(p.modelo)}">+</button></div><span class="cell-secondary" id="extra-${c.id_contrato}-${p.index}" data-extra="${p.index}"></span></td>
      <td><select class="input-custom" data-proveedor="${p.index}" aria-label="Proveedor: ${esc(p.modelo)}"${categoria(p) === 'Book' ? ' disabled' : ''}>${categoria(p) !== 'Book' || !p.id_proveedor ? '<option value="">Seleccionar proveedor</option>' : ''}${proveedoresPara(p).map((v) => `<option value="${v.id_proveedor}"${v.id_proveedor === p.id_proveedor ? ' selected' : ''}>${esc(v.razon_social)}</option>`).join('')}</select>${categoria(p) === 'Book' && !p.id_proveedor ? '<span class="cell-secondary" role="alert">LíderBook no está disponible. No se puede guardar este anuario sin proveedor.</span>' : ''}</td></tr>`;}).join('')}
      </tbody></table></div>
      <div class="table-footer compra-totals"><span data-total></span></div>`;
    colegios.append(card);
    actualizarTotal(c, card);
    return card;
  }

  const normalizar = texto => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const fecha = valor => valor ? formatDate(valor) || valor : 'Sin fecha registrada';
  function filtrarColegios() {
    if (cargandoListado || !reintentar.hidden) return;
    const texto = normalizar(input.value);
    if (!busquedaAbierta || !texto) {
      resultados.hidden = true; resultados.replaceChildren();
      estadoBusqueda.textContent = listado.length ? '' : 'No hay contratos escolares en proceso con colegio registrado.';
      return;
    }
    resultados.hidden = false;
    const coincidencias = listado.filter(c => normalizar(c.colegio).includes(texto));
    estadoBusqueda.textContent = !listado.length ? 'No hay contratos escolares en proceso con colegio registrado.'
      : !coincidencias.length ? 'No se encontraron colegios' : `${coincidencias.length} contratos encontrados. Selecciona un colegio para agregarlo.`;
    resultados.innerHTML = coincidencias.map(c => `<li><button type="button" class="${c.pedido_registrado ? 'colegio-pedido-registrado' : ''}" data-colegio="${c.id_contrato}" ${c.pedido_registrado || c.modelos_disponibles === false || contratos.has(c.id_contrato) || pending || bloqueado || !proveedores.length ? 'disabled' : ''}><strong>${esc(c.colegio)}</strong><span>${c.cliente ? esc(c.cliente) + ' · ' : ''}Contrato #${c.id_contrato} · Entrega: ${esc(fecha(c.fecha_entrega))}${c.pedido_registrado ? ' · Pedido registrado' : contratos.has(c.id_contrato) ? ' · Agregado' : ''}</span>${c.modelos_disponibles === false ? `<span class="colegio-sin-modelos">${esc(c.aviso_modelos || 'Sin modelos disponibles')}</span>` : ''}</button></li>`).join('');
  }
  async function cargarColegios() {
    if (cargandoListado) return;
    cargandoListado = true; input.disabled = true; reintentar.hidden = true;
    estadoBusqueda.textContent = 'Cargando colegios…'; resultados.replaceChildren();
    try {
      const { data } = await http('/api/contratos/colegios');
      if (!form.isConnected) return;
      if (!Array.isArray(data)) throw new Error('El listado de colegios no es válido.');
      listado = data;
      cargandoListado = false; filtrarColegios();
    } catch (error) {
      if (form.isConnected) { estadoBusqueda.textContent = error.message; reintentar.hidden = false; showToast(error.message,'error'); }
    } finally { cargandoListado = false; input.disabled = bloqueado || pending || !proveedores.length; }
  }
  input.addEventListener('input', () => { busquedaAbierta = true; filtrarColegios(); });
  input.addEventListener('focus', () => { busquedaAbierta = true; filtrarColegios(); });
  function cerrarBusqueda() { busquedaAbierta = false; resultados.hidden = true; }
  form.addEventListener('focusout', event => { if (!form.contains(event.relatedTarget)) cerrarBusqueda(); });
  editor.addEventListener('pointerdown', event => { if (!form.contains(event.target)) cerrarBusqueda(); });
  form.addEventListener('keydown', event => { if (event.key === 'Escape') {cerrarBusqueda();cancelarBusqueda();} });
  form.addEventListener('submit', event => event.preventDefault());
  reintentar.addEventListener('click', cargarColegios);
  async function agregarContrato(id) {
    if (pending || bloqueado || !proveedores.length) return;
    if(!Number.isSafeInteger(id)||id<1) {estado.textContent='Contrato no válido.';return;}
    if (contratos.has(id)) { estado.textContent = `El contrato ${id} ya está agregado.`; return; }
    pending = true; preparar.disabled = true; input.disabled = true;
    filtrarColegios(); form.setAttribute('aria-busy', 'true');
    estado.textContent = `Consultando contrato ${id}…`;
    try {
      const { data } = await http(`/api/contratos?id=${id}`);
      if (!form.isConnected) return;
      if(data.pedido_registrado){listado=listado.map(c=>c.id_contrato===id?{...c,pedido_registrado:true}:c);throw new Error('Este contrato ya tiene un pedido registrado.');}
      if (typeof data.colegio !== 'string' || !data.colegio.trim()) { listado=listado.filter(c=>c.id_contrato!==id); throw new Error('El contrato no tiene un colegio registrado.'); }
      if (data.estado_trabajo !== 'en_proceso' || normalizar(data.promocion || '') !== 'promocion') { listado=listado.filter(c=>c.id_contrato!==id); throw new Error('El contrato ya no es un contrato escolar en proceso.'); }
      if (!data.productos.length || data.modelos_disponibles === false) {
        listado=listado.map(c=>c.id_contrato===id?{...c,modelos_disponibles:false,aviso_modelos:data.aviso_modelos || 'Sin modelos disponibles'}:c);
        throw new Error(data.aviso_modelos || 'Sin modelos disponibles. Completa los modelos en el sistema de contratos.');
      }
      const liderBook = proveedores.find(esLiderBook);
      const c = { ...data, productos: data.productos.map(p => ({ ...p, cantidad_pedir: p.cantidad,
        id_proveedor: categoria(p) === 'Book' ? liderBook?.id_proveedor ?? null : null })) };
      const card = renderColegio(c);
      contratos.set(c.id_contrato, c); buscadorDesplegado=false;actualizarResumen(); actualizarBuscador(); input.value = ''; cerrarBusqueda();
      agregarColegio.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      estado.textContent = '';
    } catch (error) { if (form.isConnected) { if(error.status===404)listado=listado.filter(c=>c.id_contrato!==id); estado.textContent = error.message; showToast(error.message,'error'); } }
    finally {
      pending = false; preparar.disabled = bloqueado || !resumenValido; input.disabled = false;
      form.setAttribute('aria-busy', 'false'); filtrarColegios();
      actualizarBuscador();

    }
  }
  resultados.addEventListener('click', event => {
    const seleccion = event.target.closest('[data-colegio]');
    if (!seleccion || seleccion.disabled) return;
    void agregarContrato(Number(seleccion.dataset.colegio));
  });

  colegios.addEventListener('click', (event) => {
    const paso=event.target.closest('[data-cantidad-step]');
    if(paso){
      if(bloqueado||paso.disabled)return;
      const control=paso.closest('[data-contrato]').querySelector(`[data-cantidad="${paso.dataset.index}"]`);
      if(paso.dataset.cantidadStep==='1')control.stepUp();else control.stepDown();
      control.dispatchEvent(new Event('input',{bubbles:true}));
      return;
    }
    const quitar = event.target.closest('[data-quitar]');
    if (!quitar || bloqueado) return;
    const card = quitar.closest('[data-contrato]');
    contratos.delete(Number(card.dataset.contrato)); card.remove(); actualizarResumen(); actualizarBuscador(); filtrarColegios(); showToast('Colegio quitado del pedido','info');
  });
  function cambiar(event) {
    if (bloqueado) return;
    const control = event.target;
    const card = control.closest('[data-contrato]');
    if (!card) return;
    const c = contratos.get(Number(card.dataset.contrato));
    if (control.matches('[data-cantidad]')) {
      const p = c.productos[Number(control.dataset.cantidad)];
      p.cantidad_pedir = control.value === '' ? NaN : Number(control.value);
      const valida = cantidadValida(p.cantidad_pedir, p.cantidad);
      control.setAttribute('aria-invalid', String(!valida)); control.classList.toggle('is-invalid', !valida);
      card.querySelector(`[data-extra="${control.dataset.cantidad}"]`).textContent = !valida ? 'Usa un entero igual o mayor al contrato.' : p.cantidad_pedir > p.cantidad ? `+${formatNumber(p.cantidad_pedir - p.cantidad)} extra` : '';
      actualizarTotal(c, card);
    } else if (control.matches('[data-proveedor]')) c.productos[Number(control.dataset.proveedor)].id_proveedor = Number(control.value) || null;
    else return;
    actualizarResumen();
  }
  colegios.addEventListener('input', cambiar); colegios.addEventListener('change', cambiar);

  preparar.addEventListener('click', async () => {
    if (pending || bloqueado) return;
    actualizarResumen();
    const productos = [...contratos.values()].flatMap((c) => c.productos);
    if (!productos.length || productos.some((p) => !p.id_proveedor || !cantidadValida(p.cantidad_pedir, p.cantidad))) {
      estado.textContent = 'Completa todos los proveedores y cantidades antes de preparar las \u00f3rdenes.'; showToast(estado.textContent,'warning'); return;
    }
    setBloqueado(true); estado.textContent = 'Verificando contratos y proveedores antes de guardar…';
    try {
      const payload = [...contratos.values()].map((c) => ({ id_contrato: c.id_contrato, productos: c.productos.map((p) => ({ id_modelo: p.id_modelo, cantidad: p.cantidad_pedir, id_proveedor: p.id_proveedor })) }));
      const { data } = await http('/api/compras-masivas/revisar', 'POST', { contratos: payload });
      if (!form.isConnected) return;
      token = data.token;
      el('compraRevisionContenido').innerHTML = renderOrdenes(data.ordenes);
      editor.inert = true;
      el('compraRevisionEstado').textContent = '';
      revision.hidden = false; openOverlay('compraRevision'); estado.textContent = '';
    } catch (error) { if (form.isConnected) { estado.textContent = error.message; showToast(error.message,'error'); setBloqueado(false); } }
  });
  el('compraEditar').addEventListener('click', () => {
    token = null; editor.inert = false; setBloqueado(false); closeOverlay('compraRevision'); revision.hidden = true;
    el('contratos-title').textContent = 'Órdenes de compra';
    el('ordenPaso').textContent = 'Selecciona colegios y asigna proveedores a sus productos';
    estado.textContent = 'Puedes continuar editando los colegios y modelos seleccionados.';
    preparar.focus();
  });
  revision.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending) el('compraEditar').click(); }
    if (event.key === 'Tab') {
      const controles = [...revision.querySelectorAll('button:not(:disabled), summary')];
      const primero = controles[0], ultimo = controles.at(-1);
      if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo?.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero?.focus(); }
    }
  });
  revision.addEventListener('click', event => { if (event.target === revision && !pending) el('compraEditar').click(); });
  confirmar.addEventListener('click', async () => {
    if (!token || pending || guardado) return;
    pending = true; confirmar.disabled = true; el('compraEditar').disabled = true;
    estado.textContent = 'Guardando órdenes…';
    el('compraRevisionEstado').textContent = 'Guardando pedidos…';
    try {
      const { data } = await http('/api/compras-masivas/confirmar', 'POST', { token });
      if (!form.isConnected) return;
      guardado=true;closeOverlay('compraRevision');revision.hidden=true;editor.inert=false;
      const cantidad=data.ordenes.length;
      const guardados=new Set(contratos.keys());
      listado=listado.map(c=>guardados.has(c.id_contrato)?{...c,pedido_registrado:true}:c);
      nuevoPedido();
      showToast(cantidad+' '+(cantidad===1?'pedido guardado':'pedidos guardados'),'success');
    } catch (error) { if (form.isConnected) { estado.textContent = error.status===409&&error.message.includes('ya tiene un pedido registrado')?error.message:`${error.message} Puedes reintentar con esta misma revisión.`; el('compraRevisionEstado').textContent = estado.textContent; showToast(error.message,'error'); if(error.status===409)void cargarColegios(); } }
    finally { pending = false; confirmar.disabled = guardado; if (form.isConnected) {el('compraEditar').disabled = guardado;actualizarBuscador();} }
  });
  function nuevoPedido() {
    contratos.clear(); buscadorDesplegado=false;colegios.replaceChildren(); actualizarBuscador(); guardado = false; token = null;
    confirmar.disabled = false; el('compraEditar').disabled = false;
    actualizarResumen(); setBloqueado(false); editor.hidden = false; input.value = ''; filtrarColegios();
    el('contratos-title').textContent = 'Órdenes de compra';
    el('ordenPaso').textContent = 'Selecciona colegios y asigna proveedores a sus productos';
    cerrarBusqueda();
    estado.textContent = ''; input.focus();
  }
  if(!contratos.size)actualizarResumen();
  void cargarColegios();
  try {
    const { data } = await http('/api/proveedores');
    if (!form.isConnected) return;
    proveedores = data;
    for(const c of contratos.values())renderColegio(c);
    ajustarProveedores();
    colegios.querySelectorAll('[data-cantidad]').forEach(control=>cambiar({target:control}));
    actualizarResumen();actualizarBuscador();filtrarColegios();
    input.disabled=bloqueado||pending||cargandoListado;
    estado.textContent = proveedores.length ? '' : 'No hay proveedores activos en MySQL. Activa un proveedor antes de comenzar.';
    const destino=new URLSearchParams(location.hash.split('?')[1]||'').get('contrato');
    if(destino!==null){
      if(!/^[1-9]\d*$/.test(destino))estado.textContent='Contrato no válido.';
      else await agregarContrato(Number(destino));
    }
  } catch (error) { if (form.isConnected) { estado.textContent = error.message; showToast(error.message,'error'); } }
}
