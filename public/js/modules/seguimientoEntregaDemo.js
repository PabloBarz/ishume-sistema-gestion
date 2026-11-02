import {consolidarOrden} from '../shared/consolidacionProductos.js';
import { esc } from './ordenesCompraUi.js';
import { http, formatNumber } from '../utils.js';

// Temporal: solo transforma una copia del detalle consultado; nunca persiste.
export function simularEntrega(data, recibidos = null) {
  const detalle=consolidarOrden(data).productos;
  if(!detalle.length)return null;
  const total=detalle.reduce((n,d)=>n+d.cantidad,0);
  if(!Number.isSafeInteger(total)||total!==data.total)return null;
  const valores=recibidos??detalle.map(()=>0);
  if(!Array.isArray(valores)||valores.length!==detalle.length||valores.some((v,i)=>!Number.isSafeInteger(v)||v<0||v>detalle[i].cantidad))throw Error('Las cantidades recibidas deben ser enteras entre cero y lo pedido.');
  const lineas=detalle.map((d,i)=>({...d,linea:i,recibido:valores[i],pendiente:d.cantidad-valores[i]}));
  const recibido=valores.reduce((n,v)=>n+v,0);
  return {total,recibido,pendiente:total-recibido,estado:recibido===0?'Pendiente':recibido===total?'Recibido':'Parcial',lineas};
}

export function renderSeguimientoDemo(data, recibidos = null) {
  const simulacion = simularEntrega(data, recibidos);
  const cabecera = `<header class="seguimiento-demo-cabecera"><h2>${esc(data.codigo)}</h2><p>Proveedor: <strong>${esc(data.proveedor)}</strong></p></header>`;
  if (!simulacion) return cabecera + `<p role="status">No se dispone de un detalle completo y coherente para mostrar la entrega. Unidades solicitadas confirmadas: ${Number.isSafeInteger(data.total)?formatNumber(data.total):'No disponibles'}.</p>`;
  return cabecera + `<section aria-labelledby="seguimientoRecepcionTitulo"><div class="seguimiento-demo-recepcion"><h2 class="panel-title" id="seguimientoRecepcionTitulo">Resumen de entrega</h2>
</div><dl class="seguimiento-demo-resumen" role="status"><div><dt>Solicitado</dt><dd>${formatNumber(simulacion.total)}</dd></div><div><dt>Recibido</dt><dd>${formatNumber(simulacion.recibido)}</dd></div><div><dt>Pendiente</dt><dd>${formatNumber(simulacion.pendiente)}</dd></div><div><dt>Estado</dt><dd><span class="seguimiento-demo-estado" data-estado="${simulacion.estado}">${simulacion.estado}</span></dd></div></dl></section>
    <h2 class="panel-title seguimiento-demo-detalle-titulo">Productos de la orden</h2>
    <div class="table-scroll"><table class="table-custom seguimiento-demo-tabla"><thead><tr><th scope="col">Modelo</th><th scope="col">Pedido</th><th scope="col">Recibido</th><th scope="col">Falta</th></tr></thead><tbody>${simulacion.lineas.map(d=>`<tr><td>${esc(d.modelo)}</td><td>${formatNumber(d.cantidad)}</td><td><input class="input-custom seguimiento-demo-recibido" type="number" min="0" max="${d.cantidad}" step="1" value="${d.recibido}" data-linea-recibida="${d.linea}" aria-label="Recibido: ${esc(d.modelo)}" aria-describedby="seguimientoError-${d.linea}"><span class="field-error" id="seguimientoError-${d.linea}" hidden></span></td><td data-linea-falta="${d.linea}">${formatNumber(d.pendiente)}</td></tr>`).join('')}</tbody></table></div>
    `;
}

// Ruta temporal aislada: reutiliza exclusivamente endpoints de consulta existentes.
export async function init() {
  const root=document.getElementById('seguimientoEntregaDemo');
  const el=id=>root.querySelector('#'+id);
  const id=new URLSearchParams(location.hash.split('?')[1]||'').get('orden');
  let orden=null,pagina=1,cargando=false;
  const error=e=>{if(root.isConnected)el('seguimientoDemoEstado').textContent=e.message;};
  function actualizarRecibidos(){
    if(!orden)return;
    const entradas=[...root.querySelectorAll('[data-linea-recibida]')];
    const valores=Array(orden.productos.length).fill(null);
    for(const entrada of entradas){
      const i=Number(entrada.dataset.lineaRecibida),texto=entrada.value;
      const n=/^[0-9]+$/.test(texto)?Number(texto):NaN;
      const valida=Number.isSafeInteger(n)&&n>=0&&n<=orden.productos[i].cantidad;
      valores[i]=valida?n:null;entrada.setAttribute('aria-invalid',String(!valida));
      const aviso=el('seguimientoError-'+i);aviso.hidden=valida;aviso.textContent=valida?'':'Usa un entero entre 0 y '+orden.productos[i].cantidad+'.';
      root.querySelector('[data-linea-falta="'+i+'"]').textContent=valida?formatNumber(orden.productos[i].cantidad-n):'—';
    }
    const resumen=root.querySelectorAll('.seguimiento-demo-resumen dd');
    if(valores.some(v=>v===null)){resumen[1].textContent='—';resumen[2].textContent='—';resumen[3].querySelector('span').textContent='Revisar cantidades';resumen[3].querySelector('span').dataset.estado='Revisar';return;}
    const resultado=simularEntrega(orden,valores);
    resumen[1].textContent=formatNumber(resultado.recibido);resumen[2].textContent=formatNumber(resultado.pendiente);resumen[3].querySelector('span').textContent=resultado.estado;resumen[3].querySelector('span').dataset.estado=resultado.estado;
  }
  el('seguimientoDemoContenido').addEventListener('input',event=>{if(event.target.matches('[data-linea-recibida]'))actualizarRecibidos();});
  async function listar(numero=1){
    if(cargando)return;cargando=true;el('seguimientoDemoEstado').textContent='Cargando ordenes…';
    el('seguimientoDemoAnterior').disabled=true;el('seguimientoDemoSiguiente').disabled=true;el('seguimientoDemoOrden').disabled=true;
    try{
      const {data}=await http('/api/compras-masivas/solicitudes?pagina='+numero);
      if(!root.isConnected)return;
      if(!Array.isArray(data.solicitudes))throw Error('No se pudo consultar el listado de ordenes.');
      const ordenes=data.solicitudes.filter(o=>/^(?:OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$/.test(o.codigo));
      el('seguimientoDemoOrden').innerHTML='<option value="">Seleccionar orden</option>'+ordenes.map(o=>'<option value="'+o.id_solicitud+'">'+esc(o.codigo)+' · '+esc(o.proveedor)+'</option>').join('');
      pagina=numero;el('seguimientoDemoPagina').textContent='Pagina '+pagina;
      el('seguimientoDemoAnterior').disabled=pagina<=1;el('seguimientoDemoSiguiente').disabled=!data.hayMas;
      el('seguimientoDemoOrden').disabled=!ordenes.length;
      el('seguimientoDemoEstado').textContent=ordenes.length?'':'No hay ordenes masivas disponibles en esta pagina.';
    }catch(e){error(e);}finally{cargando=false;}
  }
  el('seguimientoDemoOrden').addEventListener('change',event=>{if(event.target.value)location.hash='#/inventario/demo-seguimiento?orden='+encodeURIComponent(event.target.value);});
  el('seguimientoDemoAnterior').addEventListener('click',()=>listar(pagina-1));
  el('seguimientoDemoSiguiente').addEventListener('click',()=>listar(pagina+1));
  if(id===null){el('seguimientoDemoSelector').hidden=false;await listar();return;}
  if(!/^[1-9][0-9]*$/.test(id)||Number(id)>2147483647){error(Error('Orden no valida.'));return;}
  el('seguimientoDemoEstado').textContent='Consultando orden…';
  try{
    const {data}=await http('/api/compras-masivas/solicitudes/'+id);
    if(!root.isConnected)return;
    if(data.id_solicitud!==Number(id)||! /^(?:OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$/.test(data.codigo))throw Error('El detalle no corresponde a la orden masiva seleccionada.');
    orden={...data,productos:consolidarOrden(data).productos};el('seguimientoDemoContenido').innerHTML=renderSeguimientoDemo(data);el('seguimientoDemoEstado').textContent='';
  }catch(e){error(e);}
}
