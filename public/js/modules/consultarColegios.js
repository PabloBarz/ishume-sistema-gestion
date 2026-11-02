import {http,formatNumber} from '../utils.js';
import {esc} from './ordenesCompraUi.js';

export async function init(){
  const root=document.getElementById('consultarColegios'),el=id=>root.querySelector('#'+id);
  const input=el('colegiosConsultaBusqueda'),resultados=el('colegiosConsultaResultados'),estado=el('colegiosConsultaEstado'),detalle=el('colegiosConsultaDetalle');
  let consulta=0,seleccion=0,timer;
  const vigente=turno=>root.isConnected&&turno===consulta;
  function cerrar(){resultados.hidden=true;}
  async function buscar(){
    if(!root.isConnected)return;
    const turno=++consulta,texto=input.value.trim();resultados.replaceChildren();cerrar();
    if(!texto){estado.textContent='';return;}
    estado.textContent='Buscando colegios…';
    try{
      const {data}=await http('/api/colegios-compras?q='+encodeURIComponent(texto));
      if(!vigente(turno))return;
      if(!Array.isArray(data.colegios))throw Error('No se pudo leer el listado de colegios.');
      resultados.innerHTML=data.colegios.map(c=>`<li><button type="button" data-colegio-consulta="${c.id_contrato}"><strong>${esc(c.colegio)}</strong><span>Contrato ${esc(c.id_contrato_api??c.id_contrato)}</span></button></li>`).join('');
      resultados.hidden=!data.colegios.length;
      estado.textContent=data.aviso||(!data.colegios.length?'No se encontraron colegios':data.hayMas?'Hay más coincidencias. Escribe una parte más específica del nombre.':'');
    }catch(e){if(vigente(turno))estado.textContent=e.message;}
  }
  input.addEventListener('input',()=>{++consulta;++seleccion;clearTimeout(timer);resultados.replaceChildren();cerrar();detalle.hidden=true;timer=setTimeout(buscar,250);});
  input.addEventListener('focus',()=>{if(resultados.children.length)resultados.hidden=false;});
  el('colegiosConsultaForm').addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);void buscar();});
  el('colegiosConsultaForm').addEventListener('focusout',event=>{if(!el('colegiosConsultaForm').contains(event.relatedTarget))cerrar();});
  el('colegiosConsultaForm').addEventListener('keydown',event=>{
    if(event.key==='Escape')cerrar();
    if(event.key==='ArrowDown'&&event.target===input&&!resultados.hidden){event.preventDefault();resultados.querySelector('button')?.focus();}
  });
  resultados.addEventListener('click',async event=>{
    const boton=event.target.closest('[data-colegio-consulta]');if(!boton)return;
    const turno=++seleccion;++consulta;clearTimeout(timer);cerrar();estado.textContent='Consultando pedidos…';detalle.hidden=true;
    try{
      const {data}=await http('/api/colegios-compras/'+boton.dataset.colegioConsulta);
      if(!root.isConnected||turno!==seleccion)return;
      input.value=data.colegio;estado.textContent='';
      const resumen=`${formatNumber(data.modelos)} ${data.modelos===1?'modelo':'modelos'} · ${formatNumber(data.proveedores)} ${data.proveedores===1?'proveedor':'proveedores'} · ${formatNumber(data.total)} ${data.total===1?'unidad':'unidades'}`;
      detalle.innerHTML=`<div class="panel-body"><h2 class="panel-title">${esc(data.colegio)}</h2><p class="text-sm text-muted">${resumen}</p></div>`+(data.productos.length?`<div class="table-scroll"><table class="table-custom colegios-consulta-tabla"><thead><tr><th scope="col">Modelo</th><th scope="col">Proveedor</th><th scope="col">Cantidad</th><th scope="col">Pedido / Orden</th><th scope="col">Situación</th></tr></thead><tbody>${data.productos.map(p=>`<tr><td>${esc(p.modelo)}</td><td>${esc(p.proveedor)}</td><td>${formatNumber(p.cantidad)}</td><td><a class="colegio-orden-link" href="#/ordenes/guardadas?vista=${p.id_solicitud!=null?'generadas':'pendientes'}&localizar=${p.id_solicitud??p.pedidos[0].id_orden}&codigo=${encodeURIComponent(p.codigo)}" title="${esc(p.pedidos.map(o=>o.codigo).join(' / '))}">${esc(p.codigo)}</a></td><td><span class="colegio-situacion">${esc(p.situacion)}</span></td></tr>`).join('')}</tbody></table></div><p class="panel-body colegios-consulta-total">Total: <strong>${formatNumber(data.total)} unidades</strong></p>`:'<p class="panel-body">Este colegio todavía no tiene pedidos de compra registrados</p>');
      detalle.hidden=false;input.focus({preventScroll:true});resultados.replaceChildren();
    }catch(e){if(root.isConnected&&turno===seleccion)estado.textContent=e.message;}
  });
}
