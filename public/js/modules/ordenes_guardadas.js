import { http, formatNumber, openOverlay, closeOverlay } from '../utils.js';
import { esc, conectarTarjetas } from './ordenesCompraUi.js';

export async function init() {
  const root = document.getElementById('ordenesGuardadas');
  const el = id => root.querySelector(`#${id}`);
  const results = el('ordenConsultada');
  const estado = el('solicitudEstado');
  const tabs = [el('tabPendientes'), el('tabRealizados')];
  let tab = 'pendientes';
  let pagina = 1;
  let filtro = '';
  let filtroMostrado = '';
  let ocupado = false;
  let hayMas = false;
  let revision = null;
  let grupos = [];
  let vistaAbierta = false;
  let consultaVista = 0;
  let versionBusqueda = 0;
  let temporizadorBusqueda;
  let busquedaEnCola = false;
  const seleccionPendientes = new Map();
  conectarTarjetas(results, estado);

  function tabla(productos) {
    return `<div class="table-scroll"><table class="table-custom solicitud-tabla"><thead><tr><th scope="col">Modelo</th><th scope="col">Cantidad</th></tr></thead><tbody>${productos.map(p=>`<tr><td>${esc(p.modelo)}</td><td>${formatNumber(p.cantidad)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function detalle(data, revisar = false) {
    const colegios = new Map();
    data.distribuciones.forEach(d=>{
      if(!colegios.has(d.id_contrato))colegios.set(d.id_contrato,{nombre:d.colegio,productos:[]});
      colegios.get(d.id_contrato).productos.push(d);
    });
    if (revisar) {
      const unidades = n => `${formatNumber(n)} ${n === 1 ? 'unidad' : 'unidades'}`;
      return `<section class="solicitud-revision-resumen" aria-label="Resumen del proveedor">
        <div class="solicitud-revision-cabecera"><h3>${esc(data.proveedor)}</h3><strong>${unidades(data.total)}</strong></div>
        <p>${revisar === 'orden' ? '' : `${data.ordenes.length} ${data.ordenes.length === 1 ? 'pedido' : 'pedidos'} · `}${colegios.size} ${colegios.size === 1 ? 'colegio' : 'colegios'}</p>
        <p class="solicitud-revision-codigos">${revisar === 'orden' ? `${esc(data.codigo)} · Emisión: ${esc(data.fecha)}` : `Pedidos incluidos: ${data.ordenes.map(o => esc(o.codigo) + (revisar === 'vista' ? ` · ${esc(o.fecha)}` : '')).join(' · ')}`}</p>
      </section>
      <details class="orden-detalle-revision" ${revisar === 'vista' || revisar === 'orden' ? 'open' : ''}><summary>Colegios, modelos y cantidades</summary><div class="solicitud-revision-colegios">${[...colegios.values()].map(c => `<section class="solicitud-revision-colegio">
        <header class="solicitud-revision-cabecera"><h4>${esc(c.nombre)}</h4><strong>${unidades(c.productos.reduce((s,p) => s + p.cantidad, 0))}</strong></header>
        ${tabla(c.productos)}</section>`).join('')}</div></details>
      <div class="solicitud-revision-total"><span>Total de la orden</span><strong>${unidades(data.total)}</strong></div>`;
    }
    return `<p>${data.ordenes.length} ${data.ordenes.length===1?'pedido incluido':'pedidos incluidos'} · ${colegios.size} ${colegios.size===1?'colegio':'colegios'} · <strong>${formatNumber(data.total)} unidades</strong></p>
      <p class="text-sm text-muted">${data.ordenes.map(o=>esc(o.codigo)).join(' · ')}</p>
      ${[...colegios.values()].map(c=>`<section class="solicitud-colegio"><h4 class="panel-title">${esc(c.nombre)}</h4>${tabla(c.productos)}</section>`).join('')}`;
  }
  function controles(value, permitirBusqueda = false) {
    ocupado = value;
    el('ordenesBuscador').querySelectorAll('input, button').forEach(n=>{n.disabled=value&&!permitirBusqueda;});
    tabs.forEach(n=>{n.disabled=value||!!revision||vistaAbierta;});
    results.querySelectorAll('input, button').forEach(n=>{n.disabled=value;});
    el('ordenesAnterior').disabled=value||pagina<=1;
    el('ordenesSiguiente').disabled=value||!hayMas;
    if(!value&&tab==='pendientes')actualizarSeleccion();
  }
  function renderPendientes() {
    return `<div class="ordenes-tarjetas">${grupos.map(g=>`<article class="orden-tarjeta" data-grupo="${g.id_proveedor}">
      <div class="compra-totals"><h3 class="panel-title">${esc(g.razon_social)}</h3><button class="btn-link pedido-ver-todos" type="button" data-ver-proveedor="${g.id_proveedor}"><i class="bi bi-eye" aria-hidden="true"></i> Ver todos los pedidos</button></div>
      <p class="text-sm text-muted">${g.ordenes.length} ${g.ordenes.length===1?'pedido':'pedidos'} · ${g.colegios} ${g.colegios===1?'colegio':'colegios'} · ${formatNumber(g.total)} unidades pendientes</p>
      <div class="solicitud-pedidos">${g.ordenes.map(o=>`<div class="solicitud-pedido"><label class="pedido-eleccion"><input type="checkbox" data-orden="${o.id_orden}" ${seleccionPendientes.get(o.id_orden) === false ? '' : 'checked'}><span><strong class="cell-code">${esc(o.codigo)}</strong><small>${esc(o.fecha)} · ${o.colegios.length} ${o.colegios.length===1?'colegio':'colegios'}</small></span></label><strong>${formatNumber(o.total)} unidades</strong><button class="btn-icon-outline pedido-ver" type="button" data-ver-pedido="${o.id_orden}" aria-label="Ver detalle del pedido ${esc(o.codigo)}"><i class="bi bi-eye" aria-hidden="true"></i></button></div>`).join('')}</div>
      <div class="solicitud-seleccion"><p data-seleccion></p><button class="btn-primary-action" type="button" data-preparar="${g.id_proveedor}">Preparar orden de compra</button></div>
    </article>`).join('')}</div>`;
  }
  function renderGeneradas(ordenes) {
    const proveedores=new Map();
    for(const orden of ordenes){
      const clave=orden.id_proveedor ?? orden.proveedor;
      if(!proveedores.has(clave))proveedores.set(clave,{nombre:orden.proveedor,ordenes:[],total:0});
      const grupo=proveedores.get(clave);grupo.ordenes.push(orden);grupo.total+=orden.total;
    }
    return `<div class="ordenes-generadas-grupos">${[...proveedores.values()].map((g,index)=>`<section class="ordenes-generadas-proveedor" aria-labelledby="ordenes-proveedor-${index}">
      <header class="ordenes-generadas-encabezado"><h3 id="ordenes-proveedor-${index}">${esc(g.nombre)}</h3><p>${g.ordenes.length} ${g.ordenes.length===1?'orden':'órdenes'}${hayMas||pagina>1?' en esta página':''} · <strong>${formatNumber(g.total)} unidades</strong></p></header>
      <ul class="ordenes-generadas-lista">${g.ordenes.map(o=>`<li class="orden-generada-fila" data-orden-generada="${o.id_solicitud}">
        <div class="orden-generada-identidad"><strong class="cell-code">${esc(o.codigo)}</strong><span>${esc(o.fecha)}</span></div>
        <strong class="orden-generada-unidades">${formatNumber(o.total)} unidades</strong><span class="badge badge-info orden-generada-estado">${esc(o.estado)}</span>
        <div class="orden-generada-acciones"><button class="btn-icon-outline" type="button" data-ver-orden="${o.id_solicitud}" aria-label="Ver detalle de ${esc(o.codigo)}"><i class="bi bi-eye" aria-hidden="true"></i></button><a class="btn-cancel" href="/api/compras-masivas/solicitudes/${o.id_solicitud}/pdf?vista=1" target="_blank" rel="noopener">Ver PDF</a><a class="btn-primary-action" href="/api/compras-masivas/solicitudes/${o.id_solicitud}/pdf" download aria-label="Descargar PDF de ${esc(o.codigo)}"><i class="bi bi-download" aria-hidden="true"></i> Descargar PDF</a></div>
      </li>`).join('')}</ul>
    </section>`).join('')}</div>`;
  }
  function actualizarSeleccion() {
    for(const g of grupos){
      const card=results.querySelector(`[data-grupo="${g.id_proveedor}"]`);
      if(!card)continue;
      const seleccionados=new Set([...card.querySelectorAll('[data-orden]:checked')].map(n=>Number(n.dataset.orden)));
      const ordenes=g.ordenes.filter(o=>seleccionados.has(o.id_orden));
      card.querySelector('[data-seleccion]').textContent=`${ordenes.length} seleccionadas · ${formatNumber(ordenes.reduce((s,o)=>s+o.total,0))} unidades`;
      card.querySelector('[data-preparar]').disabled=ocupado||!ordenes.length;
    }
  }
  async function cargar(next=1,mensaje='') {
    if(ocupado)return;
    const version=versionBusqueda;
    controles(true,true);el('ordenesBuscador').setAttribute('aria-busy','true');el('ordenesEstado').textContent='Buscando…';estado.textContent=mensaje;
    try{
      const endpoint=tab==='pendientes'?'pendientes':'solicitudes';
      const {data}=await http(`/api/compras-masivas/${endpoint}?q=${encodeURIComponent(filtro)}&pagina=${next}`);
      if(!root.isConnected||version!==versionBusqueda)return;
      filtroMostrado=filtro;
      pagina=data.pagina;hayMas=data.hayMas;
      if(tab==='pendientes'){
        grupos=data.proveedores;
        results.innerHTML=renderPendientes();
        el('ordenesEstado').textContent=grupos.length?`Página ${pagina} · Selecciona órdenes completas del mismo proveedor.`:'No hay pedidos pendientes para esta búsqueda.';
      }else{
        grupos=[];
        results.innerHTML=renderGeneradas(data.solicitudes);
        el('ordenesEstado').textContent=data.solicitudes.length?`Página ${pagina} · ${data.solicitudes.length} órdenes encontradas.`:'No hay órdenes generadas para esta búsqueda.';
      }
    }catch(error){if(root.isConnected&&version===versionBusqueda){el('ordenesEstado').textContent=error.message;results.replaceChildren();}}
    finally{
      controles(false);el('ordenesBuscador').setAttribute('aria-busy','false');
      if(busquedaEnCola&&root.isConnected){busquedaEnCola=false;void cargar();}
    }
  }
  function activarTab(nombre) {
    tab=nombre;
    tabs.forEach((button,index)=>{const active=(index===0)===(nombre==='pendientes');button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
    el('pedidosPanel').setAttribute('aria-labelledby',nombre==='pendientes'?'tabPendientes':'tabRealizados');
  }
  tabs.forEach((button,index)=>{
    button.addEventListener('click',()=>{if(ocupado||revision||vistaAbierta)return;clearTimeout(temporizadorBusqueda);versionBusqueda++;activarTab(index===0?'pendientes':'realizadas');filtro='';el('ordenesFiltro').value='';el('ordenesLimpiar').hidden=true;void cargar();});
    button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=tabs[event.key==='Home'?0:event.key==='End'?1:1-index];target.focus();target.click();}});
  });
  results.addEventListener('change',event=>{if(event.target.matches('[data-orden]')){seleccionPendientes.set(Number(event.target.dataset.orden),event.target.checked);actualizarSeleccion();}});
  results.addEventListener('click',async event=>{
    const preparar=event.target.closest('[data-preparar]');
    if(ocupado)return;
    const verPedido=event.target.closest('[data-ver-pedido]');
    const verProveedor=event.target.closest('[data-ver-proveedor]');
    const verOrden=event.target.closest('[data-ver-orden]');
    if(verPedido||verProveedor||verOrden){
      clearTimeout(temporizadorBusqueda);
      const consulta=++consultaVista;vistaAbierta=true;controles(true);el('pedidosPanel').inert=true;
      el('pedido-vista-title').textContent=verOrden?'Detalle de la orden de compra':verPedido?'Detalle del pedido':'Todos los pedidos pendientes del proveedor';
      el('pedidoVistaContenido').textContent=verOrden?'Cargando orden…':'Cargando pedidos…';el('pedidoVista').hidden=false;openOverlay('pedidoVista');
      try{
        const url=verOrden?`/api/compras-masivas/solicitudes/${verOrden.dataset.verOrden}`:verPedido?`/api/compras-masivas/pendientes/${verPedido.dataset.verPedido}/detalle`:`/api/compras-masivas/pendientes/proveedor/${verProveedor.dataset.verProveedor}/detalle`;
        const {data}=await http(url);
        if(!root.isConnected||consulta!==consultaVista)return;
        if(data.distribuciones.some(d=>typeof d.colegio!=='string'||!d.colegio.trim()))throw new Error('Falta el nombre del colegio en este pedido. Revisa la referencia del contrato.');
        el('pedidoVistaContenido').innerHTML=detalle(data,verOrden?'orden':'vista');
      }catch(error){if(root.isConnected&&consulta===consultaVista)el('pedidoVistaContenido').innerHTML=`<p role="alert">${esc(error.message)}</p>`;}
      finally{if(consulta===consultaVista)controles(false);}
      return;
    }
    if(preparar){
      clearTimeout(temporizadorBusqueda);
      const card=preparar.closest('[data-grupo]');
      const ids=[...card.querySelectorAll('[data-orden]:checked')].map(n=>Number(n.dataset.orden));
      controles(true);estado.textContent='Revisando órdenes seleccionadas…';
      try{
        const proveedor=Number(preparar.dataset.preparar);
        const {data}=await http('/api/compras-masivas/solicitudes/revisar','POST',{ordenes:ids,id_proveedor:proveedor});
        if(!root.isConnected)return;
        revision={ordenes:ids,id_proveedor:proveedor,huella:data.huella,clave_operacion:crypto.randomUUID()};
        el('solicitudRevisionContenido').innerHTML=detalle(data, true);
        el('pedidosPanel').inert=true;el('solicitudRevision').hidden=false;
        el('solicitudRevisionEstado').textContent='';
        openOverlay('solicitudRevision');estado.textContent='';
      }catch(error){if(root.isConnected)estado.textContent=error.message;}
      finally{controles(false);}
    }
  });
  el('solicitudVolver').addEventListener('click',()=>{
    if(ocupado)return;
    revision=null;el('pedidosPanel').inert=false;controles(false);closeOverlay('solicitudRevision');el('solicitudRevision').hidden=true;estado.textContent='Puedes cambiar las órdenes seleccionadas.';
    if(filtro!==filtroMostrado)void cargar();
  });
  el('solicitudRevision').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!ocupado)el('solicitudVolver').click();}
    if(event.key==='Tab'){
      const controles=[...el('solicitudRevision').querySelectorAll('button:not(:disabled), summary')];
      const primero=controles[0],ultimo=controles.at(-1);
      if(event.shiftKey&&document.activeElement===primero){event.preventDefault();ultimo?.focus();}
      else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primero?.focus();}
    }
  });
  el('solicitudRevision').addEventListener('click',event=>{if(event.target===el('solicitudRevision')&&!ocupado)el('solicitudVolver').click();});
  el('solicitudConfirmar').addEventListener('click',async()=>{
    if(ocupado||!revision)return;
    controles(true);el('solicitudConfirmar').disabled=true;el('solicitudVolver').disabled=true;
    estado.textContent='Generando orden de compra…';
    el('solicitudRevisionEstado').textContent='Generando orden de compra…';
    try{
      const {data}=await http('/api/compras-masivas/solicitudes/confirmar','POST',revision);
      if(!root.isConnected)return;
      revision=null;closeOverlay('solicitudRevision');el('solicitudRevision').hidden=true;el('pedidosPanel').inert=false;
      activarTab('realizadas');filtro='';el('ordenesFiltro').value='';el('ordenesLimpiar').hidden=true;
      controles(false);await cargar(1,`Orden ${data.codigo} generada correctamente.`);
    }catch(error){if(root.isConnected){estado.textContent=`${error.message} Puedes reintentar esta misma confirmación sin duplicar la solicitud.`;el('solicitudRevisionEstado').textContent=estado.textContent;}}
    finally{controles(false);el('solicitudConfirmar').disabled=false;el('solicitudVolver').disabled=false;}
  });
  function buscarAutomatico(inmediato=false){
    filtro=el('ordenesFiltro').value.trim();versionBusqueda++;
    el('ordenesAnterior').disabled=true;el('ordenesSiguiente').disabled=true;
    el('ordenesLimpiar').hidden=!el('ordenesFiltro').value;
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda=setTimeout(()=>{if(!root.isConnected||revision||vistaAbierta)return;if(ocupado)busquedaEnCola=true;else void cargar();},inmediato?0:300);
  }
  el('ordenesFiltro').addEventListener('input',()=>buscarAutomatico());
  el('ordenesLimpiar').addEventListener('click',()=>{el('ordenesFiltro').value='';buscarAutomatico(true);el('ordenesFiltro').focus();});
  el('ordenesBuscador').addEventListener('submit',event=>{event.preventDefault();buscarAutomatico(true);});
  el('pedidoVistaCerrar').addEventListener('click',()=>{
    consultaVista++;vistaAbierta=false;el('pedidosPanel').inert=false;controles(false);closeOverlay('pedidoVista');el('pedidoVista').hidden=true;
    if(filtro!==filtroMostrado)void cargar();
  });
  el('pedidoVista').addEventListener('click',event=>{if(event.target===el('pedidoVista'))el('pedidoVistaCerrar').click();});
  el('pedidoVista').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();el('pedidoVistaCerrar').click();}
    if(event.key==='Tab'){
      const elementos=[...el('pedidoVista').querySelectorAll('summary,button:not(:disabled)')];
      const primero=elementos[0],ultimo=elementos.at(-1);
      if(event.shiftKey&&document.activeElement===primero){event.preventDefault();ultimo?.focus();}
      else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primero?.focus();}
    }
  });
  el('ordenesAnterior').addEventListener('click',()=>void cargar(pagina-1));
  el('ordenesSiguiente').addEventListener('click',()=>void cargar(pagina+1));
  void cargar();
}
