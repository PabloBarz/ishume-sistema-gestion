import {consolidarOrden} from '../shared/consolidacionProductos.js';
import { http, formatNumber, openOverlay, closeOverlay, showToast } from '../utils.js';
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
    const consolidado=consolidarOrden(data);
    const ordenes=data.ordenes??[];
    const multiple=revisar===true||revisar==='proveedor';
    let informacion;
    if(multiple){
      informacion='<dl class="orden-consulta-datos"><div><dt>Proveedor</dt><dd>'+esc(data.proveedor)+'</dd></div><div><dt>Pedidos incluidos</dt><dd>'+formatNumber(ordenes.length)+'</dd></div></dl>'+ 
        '<div class="orden-consulta-pedidos"><span class="orden-consulta-etiqueta">Códigos de los pedidos</span><ul class="orden-consulta-codigos">'+ordenes.map(o=>'<li>'+esc(o.codigo)+'</li>').join('')+'</ul></div>';
    }else{
      const generada=revisar==='orden';
      const codigo=generada?data.codigo:ordenes[0]?.codigo??data.codigo;
      const fecha=generada?data.fecha:ordenes[0]?.fecha??data.fecha;
      informacion='<dl class="orden-consulta-datos"><div><dt>'+ (generada?'Orden':'Pedido')+'</dt><dd>'+esc(codigo)+'</dd></div><div><dt>Proveedor</dt><dd>'+esc(data.proveedor)+'</dd></div>'+(fecha?'<div><dt>Fecha '+(generada?'de emisión':'del pedido')+'</dt><dd>'+esc(fecha)+'</dd></div>':'')+'</dl>';
    }
    return informacion+tabla(consolidado.productos)+'<p class="orden-consulta-total">Total de unidades: <strong>'+formatNumber(consolidado.total)+' unidades</strong></p>';
  }
  function controles(value, permitirBusqueda = false) {
    ocupado = value;
    el('ordenesBuscador').querySelectorAll('input, button').forEach(n=>{n.disabled=value&&!permitirBusqueda;});
    tabs.forEach(n=>{n.disabled=value||!!revision||vistaAbierta;});
    results.querySelectorAll('input, button:not(.orden-seguimiento-link)').forEach(n=>{n.disabled=value;});
    el('ordenesAnterior').disabled=value||pagina<=1;
    el('ordenesSiguiente').disabled=value||!hayMas;
    if(!value&&tab==='pendientes')actualizarSeleccion();
  }
  function renderPendientes() {
    return `<div class="ordenes-tarjetas">${grupos.map(g=>`<article class="orden-tarjeta" data-grupo="${g.id_proveedor}">
      <div class="compra-totals"><h3 class="panel-title">${esc(g.razon_social)}</h3><div class="pendientes-proveedor-total"><strong>${formatNumber(g.total)} unidades pendientes</strong><button class="btn-icon-outline pedido-ver-todos" type="button" data-ver-proveedor="${g.id_proveedor}" aria-label="Ver todos los pedidos de ${esc(g.razon_social)}"><i class="bi bi-eye" aria-hidden="true"></i></button></div></div>
      <div class="solicitud-pedidos">${g.ordenes.map(o=>`<div class="solicitud-pedido"><label class="pedido-eleccion"><input type="checkbox" data-orden="${o.id_orden}" ${seleccionPendientes.get(o.id_orden) === false ? '' : 'checked'}><span><strong class="cell-code">${esc(o.codigo)}</strong></span></label><strong>${formatNumber(o.total)} unidades</strong><button class="btn-icon-outline pedido-ver" type="button" data-ver-pedido="${o.id_orden}" aria-label="Ver detalle del pedido ${esc(o.codigo)}"><i class="bi bi-eye" aria-hidden="true"></i></button></div>`).join('')}</div>
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
        <strong class="orden-generada-unidades">${formatNumber(o.total)} unidades</strong>
        <div class="orden-generada-acciones"><button class="btn-icon-outline" type="button" data-ver-orden="${o.id_solicitud}" title="Ver detalle" aria-label="Ver detalle de ${esc(o.codigo)}"><i class="bi bi-eye" aria-hidden="true"></i></button><a class="btn-cancel" href="#/pagos?localizar=${o.id_solicitud}" aria-label="Pagos de ${esc(o.codigo)}">Pagos</a><a class="btn-primary-action" href="/api/compras-masivas/solicitudes/${o.id_solicitud}/pdf" download aria-label="Descargar PDF de ${esc(o.codigo)}"><i class="bi bi-download" aria-hidden="true"></i> Descargar PDF</a><button class="btn-icon-outline orden-seguimiento-link" type="button" disabled data-seguimiento-orden="${o.id_solicitud}" title="Seguimiento de entrega" aria-label="Seguimiento de entrega"><i class="bi bi-truck" aria-hidden="true"></i></button></div>
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
  async function cargar(next=1) {
    if(ocupado)return;
    const version=versionBusqueda;
    controles(true,true);el('ordenesBuscador').setAttribute('aria-busy','true');el('ordenesEstado').textContent='Buscando…';estado.textContent='';
    try{
      const endpoint=tab==='pendientes'?'pendientes':'solicitudes';
      const {data}=await http(`/api/compras-masivas/${endpoint}?q=${encodeURIComponent(filtro)}&pagina=${next}`);
      if(!root.isConnected||version!==versionBusqueda)return;
      filtroMostrado=filtro;
      pagina=data.pagina;hayMas=data.hayMas;
      if(tab==='pendientes'){
        grupos=data.proveedores;
        results.innerHTML=renderPendientes();
        el('ordenesEstado').textContent=grupos.length?'':'No hay pedidos pendientes para esta búsqueda.';
      }else{
        grupos=[];
        results.innerHTML=renderGeneradas(data.solicitudes);
        el('ordenesEstado').textContent=data.solicitudes.length?'':'No hay órdenes generadas para esta búsqueda.';
      }
      const destino=new URLSearchParams(location.hash.split('?')[1]||'');
      const id=destino.get('localizar');
      if(/^\d+$/.test(id||'')){
        const fila=tab==='pendientes'?results.querySelector('[data-orden="'+id+'"]')?.closest('.solicitud-pedido'):results.querySelector('[data-orden-generada="'+id+'"]');
        if(fila){fila.classList.add('colegio-orden-localizada');fila.scrollIntoView({block:'nearest'});}
      }
      el('ordenesPaginacion').hidden=pagina===1&&!hayMas;
      el('ordenesPagina').textContent=`Página ${pagina}`;
    }catch(error){if(root.isConnected&&version===versionBusqueda){el('ordenesEstado').textContent=error.message;results.replaceChildren();showToast(error.message,'error');}}
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
      el('pedidoVista').classList.toggle('orden-consulta',!!verOrden);
      const vistaPdf=el('pedidoVistaPdf');vistaPdf.hidden=true;vistaPdf.removeAttribute('href');
      el('pedido-vista-title').textContent=verOrden?'Detalle de orden de compra':verPedido?'Detalle del pedido':'Todos los pedidos pendientes del proveedor';
      el('pedidoVistaContenido').textContent=verOrden?'Cargando orden…':'Cargando pedidos…';el('pedidoVista').hidden=false;openOverlay('pedidoVista');
      try{
        const url=verOrden?`/api/compras-masivas/solicitudes/${verOrden.dataset.verOrden}`:verPedido?`/api/compras-masivas/pendientes/${verPedido.dataset.verPedido}/detalle`:`/api/compras-masivas/pendientes/proveedor/${verProveedor.dataset.verProveedor}/detalle`;
        const {data}=await http(url);
        if(!root.isConnected||consulta!==consultaVista)return;
        el('pedidoVistaContenido').innerHTML=detalle(data,verOrden?'orden':verProveedor?'proveedor':'pedido');
        if(verOrden){vistaPdf.href=`/api/compras-masivas/solicitudes/${verOrden.dataset.verOrden}/pdf?vista=1`;vistaPdf.hidden=false;}
      }catch(error){if(root.isConnected&&consulta===consultaVista){el('pedidoVistaContenido').innerHTML=`<p role="alert">${esc(error.message)}</p>`;showToast(error.message,'error');}}
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
      }catch(error){if(root.isConnected){estado.textContent=error.message;showToast(error.message,'error');}}
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
      await http('/api/compras-masivas/solicitudes/confirmar','POST',revision);
      if(!root.isConnected)return;
      revision=null;closeOverlay('solicitudRevision');el('solicitudRevision').hidden=true;el('pedidosPanel').inert=false;
      activarTab('realizadas');filtro='';el('ordenesFiltro').value='';el('ordenesLimpiar').hidden=true;
      controles(false);showToast('Orden de compra generada','success');await cargar(1);
    }catch(error){if(root.isConnected){estado.textContent=`${error.message} Puedes reintentar esta misma confirmación sin duplicar la solicitud.`;el('solicitudRevisionEstado').textContent=estado.textContent;showToast(error.message,'error');}}
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
      const elementos=[...el('pedidoVista').querySelectorAll('summary,select:not(:disabled),button:not(:disabled),a[href]:not([hidden])')];
      const primero=elementos[0],ultimo=elementos.at(-1);
      if(event.shiftKey&&document.activeElement===primero){event.preventDefault();ultimo?.focus();}
      else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primero?.focus();}
    }
  });
  el('ordenesAnterior').addEventListener('click',()=>void cargar(pagina-1));
  el('ordenesSiguiente').addEventListener('click',()=>void cargar(pagina+1));
  if(new URLSearchParams(location.hash.split('?')[1]||'').get('vista')==='generadas')activarTab('realizadas');
  const destino=new URLSearchParams(location.hash.split('?')[1]||'');
  if(destino.get('codigo')&&/^\d+$/.test(destino.get('localizar')||'')){
    filtro=destino.get('codigo');el('ordenesFiltro').value=filtro;el('ordenesLimpiar').hidden=false;
  }
  void cargar();
}
