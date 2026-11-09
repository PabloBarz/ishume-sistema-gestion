import {http,formatNumber} from '../utils.js';
import {esc} from './ordenesCompraUi.js';

export async function init(){
  const root=document.getElementById('consultarColegios'),el=id=>root.querySelector('#'+id);
  const input=el('colegiosConsultaBusqueda'),resultados=el('colegiosConsultaResultados'),estado=el('colegiosConsultaEstado');
  let consulta=0,seleccion=0,timer,pagina=1,filtro='todos',paginas=1,totalResultados=0;
  const detalle=document.createElement('section');
  detalle.id='colegiosConsultaDetalle';detalle.className='colegios-consulta-detalle';detalle.hidden=true;
  const estadoDetalle=document.createElement('p');estadoDetalle.id='colegiosConsultaDetalleEstado';estadoDetalle.setAttribute('role','status');
  const consultasDetalle=new Map();
  let expandido=null;
  function cerrarDetalle(){
    ++seleccion;
    resultados.querySelectorAll('[data-colegio-consulta]').forEach(b=>{b.setAttribute('aria-expanded','false');b.textContent='Ver detalle';});
    expandido?.remove();expandido=null;detalle.hidden=true;delete detalle.dataset.contrato;
  }
  const claveListado='ishume.colegios.listado';
  let anterior={};
  try{anterior=JSON.parse(sessionStorage.getItem(claveListado)||'{}')||{};}catch{}
  input.value=typeof anterior.q==='string'?anterior.q.slice(0,200):'';
  filtro=['todos','sin_pedido','pendiente','generada'].includes(anterior.filtro)?anterior.filtro:'todos';
  pagina=Number.isSafeInteger(anterior.pagina)&&anterior.pagina>0?anterior.pagina:1;
  el('colegiosConsultaFiltros').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filtro===filtro)));
  function guardarListado(){
    try{sessionStorage.setItem(claveListado,JSON.stringify({q:input.value,filtro,pagina,scroll:window.scrollY}));}catch{}
  }
  const vigente=turno=>root.isConnected&&turno===consulta;
  async function buscar(){
    if(!root.isConnected)return;
    cerrarDetalle();
    const turno=++consulta;
    estado.textContent='Consultando colegios…';resultados.setAttribute('aria-busy','true');
    try{
      const params=new URLSearchParams({listado:'1',q:input.value.trim(),filtro,pagina:String(pagina)});
      const {data}=await http('/api/colegios-compras?'+params);
      if(!vigente(turno))return;
      if(!Array.isArray(data.colegios))throw Error('No se pudo leer el listado de colegios.');
      pagina=data.pagina??1;paginas=data.paginas??1;
      resultados.innerHTML=data.colegios.map(c=>`<tr><td><strong>${esc(c.colegio)}</strong><span class="colegio-lista-contrato">Contrato ${esc(c.id_contrato_api??c.id_contrato)}</span></td><td>${formatNumber(c.modelos??0)}</td><td><span class="colegio-modelo-estado" title="${esc((c.situaciones||[]).join(' / '))}">${esc(c.situaciones?.length>1?'Situación mixta':c.situaciones?.[0]||'Sin pedido')}</span></td><td><button type="button" class="colegio-lista-seleccion" data-colegio-consulta="${esc(c.id_contrato_api)}" aria-expanded="false" aria-controls="colegiosConsultaDetalle" aria-label="Ver detalle de ${esc(c.colegio)}, contrato ${esc(c.id_contrato_api)}">Ver detalle</button></td></tr>`).join('');
      totalResultados=data.total;estado.textContent=formatNumber(totalResultados)+' resultados';
      el('colegiosConsultaPagina').textContent='Página '+pagina+' de '+paginas;
      el('colegiosConsultaAnterior').disabled=pagina<=1;
      el('colegiosConsultaSiguiente').disabled=pagina>=paginas;
    }catch(e){if(vigente(turno)){resultados.replaceChildren();estado.textContent=e.message;el('colegiosConsultaPagina').textContent='';el('colegiosConsultaAnterior').disabled=true;el('colegiosConsultaSiguiente').disabled=true;}}
    finally{if(vigente(turno))resultados.removeAttribute('aria-busy');}
  }
  function reiniciarBusqueda(){++consulta;++seleccion;clearTimeout(timer);pagina=1;cerrarDetalle();resultados.replaceChildren();}
  input.addEventListener('input',()=>{reiniciarBusqueda();timer=setTimeout(buscar,250);});
  el('colegiosConsultaForm').addEventListener('submit',event=>{event.preventDefault();reiniciarBusqueda();void buscar();});
  el('colegiosConsultaFiltros').addEventListener('click',event=>{
    const boton=event.target.closest('[data-filtro]');if(!boton)return;
    filtro=boton.dataset.filtro;
    el('colegiosConsultaFiltros').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===boton)));
    reiniciarBusqueda();void buscar();
  });
  el('colegiosConsultaAnterior').addEventListener('click',()=>{if(pagina>1){pagina--;void buscar();}});
  el('colegiosConsultaSiguiente').addEventListener('click',()=>{if(pagina<paginas){pagina++;void buscar();}});
  async function consultar(id,boton){
    if(boton.getAttribute('aria-expanded')==='true'){cerrarDetalle();return;}
    cerrarDetalle();guardarListado();
    const turno=++seleccion;
    boton.setAttribute('aria-expanded','true');boton.textContent='Cerrar detalle';
    expandido=document.createElement('tr');expandido.className='colegio-detalle-expandido';
    const celda=document.createElement('td');celda.colSpan=4;expandido.append(celda);
    celda.append(estadoDetalle,detalle);boton.closest('tr').after(expandido);
    estadoDetalle.textContent='Consultando pedidos…';detalle.hidden=true;
    try{
      if(!consultasDetalle.has(id))consultasDetalle.set(id,http('/api/colegios-compras/'+encodeURIComponent(id)).catch(error=>{consultasDetalle.delete(id);throw error;}));
      const {data}=await consultasDetalle.get(id);
      if(!root.isConnected||turno!==seleccion)return;
      detalle.dataset.contrato=String(data.id_contrato_api);estadoDetalle.textContent='';
      const contratadas=data.productos.reduce((s,p)=>s+(p.cantidad_contratada??0),0);
      const desconocidas=data.productos.some(p=>p.cantidad_contratada==null);
      const pendientes=data.productos.some(p=>p.cantidad_por_solicitar==null)?null:data.productos.reduce((s,p)=>s+p.cantidad_por_solicitar,0);
      const resumen=`${formatNumber(data.modelos)} ${data.modelos===1?'modelo':'modelos'} · ${desconocidas?'Cantidad contratada no disponible':formatNumber(contratadas)+' unidades contratadas'}${pendientes==null?'':' · '+formatNumber(pendientes)+' pendientes'}`;
      const fila=p=>{
        const refs=[...new Map((p.referencias||[]).map(r=>[(r.id_solicitud!=null?'s'+r.id_solicitud:'o'+r.id_orden),r])).values()];
        const proveedores=(p.proveedores||[]).map(pr=>pr.nombre);
        const nombres=proveedores.length?proveedores.join(' / '):p.cantidad>0?p.proveedor:'';
        const enlaces=refs.map(r=>`<a class="colegio-orden-link" href="#/ordenes/guardadas?vista=${r.id_solicitud!=null?'generadas':'pendientes'}&localizar=${r.id_solicitud??r.id_orden}&codigo=${encodeURIComponent(r.codigo)}">${esc(r.codigo)}</a>`);
        const referencias=enlaces.length?`<div class="colegio-modelo-referencias">${nombres?'<span>'+esc(nombres)+'</span>':''}<span>· ${formatNumber(p.cantidad)} solicitadas</span>${enlaces.map(e=>'<span>· '+e+'</span>').join('')}</div>`:'';
        const extra=p.cantidad_contratada==null?0:Math.max(0,p.cantidad-p.cantidad_contratada);
        const situaciones=refs.length?[...new Set(refs.map(r=>r.id_solicitud!=null?'Generada':'Pedido pendiente'))]:[p.situacion];
        const badges=situaciones.map(t=>`<span class="colegio-modelo-estado ${t==='Generada'?'es-generada':t==='Pedido pendiente'?'es-pendiente':''}">${esc(t)}</span>`).join('');
        return `<tr class="colegio-modelo-fila"><td><div class="colegio-modelo-info"><h4>${esc(p.modelo)}</h4>${referencias}${extra>0?`<span class="colegio-modelo-extra">+${formatNumber(extra)} extra</span>`:''}</div></td><td>${p.cantidad_contratada==null?'—':formatNumber(p.cantidad_contratada)}</td><td>${p.cantidad_por_solicitar==null?'—':formatNumber(p.cantidad_por_solicitar)}</td><td><div class="colegio-modelo-estados">${badges}</div></td></tr>`;
      };
      const secciones=data.productos.map(fila).join('');
      detalle.innerHTML=`<div class="colegio-consulta-cabecera"><div class="colegio-consulta-identidad"><h2 class="panel-title">${esc(data.colegio)}</h2><p class="text-sm text-muted">${resumen}</p></div></div>`+
        (data.productos.length?`<div class="table-scroll"><table class="table-custom colegio-categoria-tabla"><thead><tr><th scope="col">Modelo</th><th scope="col">Contrato</th><th scope="col">Pendiente</th><th scope="col">Situación</th></tr></thead><tbody>${secciones}</tbody></table></div>`:'<p class="colegio-consulta-vacio">El contrato no tiene modelos registrados.</p>');
      detalle.hidden=false;
    }catch(e){if(root.isConnected&&turno===seleccion)estadoDetalle.textContent=e.message;}
  }
  resultados.addEventListener('click',event=>{
    const boton=event.target.closest('[data-colegio-consulta]');
    if(boton)void consultar('api-'+boton.dataset.colegioConsulta,boton);
  });
  await buscar();
  const destino=new URLSearchParams(location.hash.split('?')[1]||'').get('contrato');
  if(destino!==null){
    if(!/^[1-9]\d*$/.test(destino))estado.textContent='Contrato no válido.';
    else{
      const boton=[...resultados.querySelectorAll('[data-colegio-consulta]')].find(b=>b.dataset.colegioConsulta===destino);
      if(boton)await consultar('api-'+destino,boton);
    }
  }else if(root.isConnected){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(root.isConnected)window.scrollTo({top:Number.isFinite(anterior.scroll)?Math.max(0,anterior.scroll):0,behavior:'instant'});
  }
}
