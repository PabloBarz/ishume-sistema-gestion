import { http, formatNumber, formatCurrencyPEN, formatDate, clearErrors, setError } from '../utils.js';
import { esc } from './ordenesCompraUi.js';

// Todo importe de este prototipo se conserva en céntimos y solo en memoria.
export function centimos(valor) {
  const texto=String(valor).trim().replace(',','.');
  if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(texto))return null;
  const [entero,decimal='']=texto.split('.');
  const monto=Number(entero)*100+Number(decimal.padEnd(2,'0'));
  return Number.isSafeInteger(monto)&&monto>0?monto:null;
}
const abonado = simulacion => simulacion.abonos.reduce((s,a)=>s+a.monto,0);
export function estadoDemo(simulacion) {
  if(simulacion.importe===null)return 'Sin cotización';
  const pagado=abonado(simulacion);
  return pagado===0?'Pendiente':pagado===simulacion.importe?'Pagado':'Parcial';
}
const soles = n => formatCurrencyPEN(n/100);
const metodos = ['Efectivo','Transferencia','Yape','Plin'];
const claseEstado = estado => estado==='Pagado'?'badge-success':estado==='Sin cotización'?'badge-info':'badge-warning';

export async function init() {
  const root=document.getElementById('pagos');
  const el=id=>root.querySelector(`#${id}`);
  const simulaciones=new Map();
  const cacheOrdenes=new Map();
  const operaciones=new Set();
  let proveedores=[],ordenes=[],proveedor=null,orden=null;
  let version=0,registrando=false,archivoTemporal=null;
  const simulacion=o=>{
    const clave=`${o.id_proveedor}:${o.id_solicitud}`;
    if(!simulaciones.has(clave))simulaciones.set(clave,{importe:null,archivo:null,abonos:[]});
    return simulaciones.get(clave);
  };
  function soltarTemporal(){if(archivoTemporal)URL.revokeObjectURL(archivoTemporal.url);archivoTemporal=null;}
  function limpiar(){
    soltarTemporal();
    for(const s of simulaciones.values())if(s.archivo)URL.revokeObjectURL(s.archivo.url);
    simulaciones.clear();
    window.removeEventListener('hashchange',limpiar);window.removeEventListener('pagehide',limpiar);
  }
  window.addEventListener('hashchange',limpiar);window.addEventListener('pagehide',limpiar);
  function resumen(){
    let acordado=0,pagado=0;
    for(const o of ordenes){const s=simulacion(o);if(s.importe!==null){acordado+=s.importe;pagado+=abonado(s);}}
    el('pagosTotalAcordado').textContent=soles(acordado);
    el('pagosTotalAbonado').textContent=soles(pagado);
    el('pagosSaldoPendiente').textContent=soles(acordado-pagado);
  }
  function listado(){
    resumen();
    el('pagosOrdenes').innerHTML=ordenes.length?`<div class="table-scroll"><table class="table-custom pagos-tabla"><thead><tr><th scope="col">Orden</th><th scope="col">Colegios</th><th scope="col">Unidades</th><th scope="col">Importe acordado</th><th scope="col">Estado de pago</th></tr></thead><tbody>${ordenes.map(o=>{
      const s=simulacion(o),estado=estadoDemo(s);
      return `<tr class="${orden?.id_solicitud===o.id_solicitud?'pagos-orden-activa':''}"><td><button type="button" class="btn-link pagos-codigo" data-pago-orden="${o.id_solicitud}" aria-pressed="${orden?.id_solicitud===o.id_solicitud}">${esc(o.codigo)}</button></td><td>${formatNumber(o.colegios)}</td><td>${formatNumber(o.total)}</td><td>${s.importe===null?'—':soles(s.importe)}</td><td><span class="badge ${claseEstado(estado)}">${estado}</span></td></tr>`;
    }).join('')}</tbody></table></div>`:'<p class="panel-note">Este proveedor no tiene órdenes de compra masivas generadas.</p>';
  }
  const campo=(id,titulo,control)=>`<div><label class="form-label-custom" for="${id}">${titulo}</label>${control}<p class="field-error" id="err-${id}" aria-live="polite"></p></div>`;
  function detalle(){
    soltarTemporal();
    el('pagosDetalle').hidden=!orden;
    if(!orden)return;
    const s=simulacion(orden),estado=estadoDemo(s);
    el('pagosDetalleTitulo').textContent=`${orden.codigo} · ${proveedor.razon_social}`;
    el('pagosDetalleEstado').textContent=estado;el('pagosDetalleEstado').className=`badge ${claseEstado(estado)}`;
    if(s.importe===null){
      el('pagosDetalleContenido').innerHTML=`<h3 class="panel-title">Registrar cotización <small class="text-muted">· demostración</small></h3>
        <form id="pagosCotizacionForm" class="pagos-form" data-operacion="${crypto.randomUUID()}" novalidate>
        ${campo('pagosArchivo','Archivo de cotización','<input class="input-custom" id="pagosArchivo" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" required><small class="text-muted">JPG, PNG o PDF · máximo 10 MB. El archivo no se subirá.</small>')}
        <div id="pagosArchivoVista" class="pagos-archivo-vista" aria-live="polite"></div>
        ${campo('pagosImporte','Importe total acordado (S/)','<input class="input-custom" id="pagosImporte" type="text" inputmode="decimal" placeholder="Ej. 1500.00" maxlength="18" required>')}
        <button class="btn-primary-action" type="submit">Registrar cotización de prueba</button></form>`;
      return;
    }
    const pagado=abonado(s),saldo=s.importe-pagado;
    el('pagosDetalleContenido').innerHTML=`<dl class="pagos-orden-resumen"><div><dt>Importe acordado</dt><dd>${soles(s.importe)}</dd></div><div><dt>Total abonado</dt><dd>${soles(pagado)}</dd></div><div><dt>Saldo pendiente</dt><dd>${soles(saldo)}</dd></div></dl>
      <p class="pagos-archivo-registrado">Cotización de demostración: <a href="${esc(s.archivo.url)}" target="_blank" rel="noopener">${esc(s.archivo.file.name)}</a></p>
      ${saldo>0?`<button class="btn-primary-action" id="pagosAgregarAbono" type="button" aria-expanded="false" aria-controls="pagosAbonoForm">+ Registrar abono</button>
      <form id="pagosAbonoForm" class="pagos-form" data-operacion="${crypto.randomUUID()}" novalidate hidden>
        ${campo('pagosAbonoMonto','Monto del abono (S/)','<input class="input-custom" id="pagosAbonoMonto" type="text" inputmode="decimal" maxlength="18" required>')}
        <div class="pagos-form-fila">${campo('pagosAbonoFecha','Fecha del pago','<input class="input-custom" id="pagosAbonoFecha" type="date" required>')}
        ${campo('pagosAbonoMetodo','Método de pago',`<select class="input-custom" id="pagosAbonoMetodo" required><option value="">Seleccionar</option>${metodos.map(m=>`<option>${m}</option>`).join('')}</select>`)}</div>
        ${campo('pagosAbonoReferencia','Observación o referencia (opcional)','<input class="input-custom" id="pagosAbonoReferencia" type="text" maxlength="200">')}
        <button class="btn-primary-action" type="submit">Registrar abono de prueba</button>
      </form>`:'<p class="pagos-completado"><i class="bi bi-check-circle-fill" aria-hidden="true"></i> Pagado · demostración</p>'}
      <h3 class="panel-title pagos-historial-title">Historial de abonos</h3>
      ${s.abonos.length?`<ul class="pagos-historial">${s.abonos.map(a=>`<li><span>${esc(formatDate(a.fecha))}<small>${esc(a.metodo)}${a.referencia?` · ${esc(a.referencia)}`:''}</small></span><strong>${soles(a.monto)}</strong></li>`).join('')}</ul>`:'<p class="text-sm text-muted">Todavía no hay abonos de demostración.</p>'}`;
    if(saldo>0)el('pagosAbonoFecha').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
  async function cargarProveedores(){
    const turno=++version;el('pagosReintentar').hidden=true;
    try{
      const {data}=await http('/api/proveedores');
      if(!root.isConnected||turno!==version)return;
      proveedores=data;
      el('pagosProveedor').innerHTML=`<option value="">Selecciona un proveedor</option>${proveedores.map(p=>`<option value="${p.id_proveedor}">${esc(p.razon_social)}</option>`).join('')}`;
      el('pagosProveedor').disabled=!proveedores.length;
      el('pagosEstado').textContent=proveedores.length?'Selecciona un proveedor para ver sus órdenes.':'No hay proveedores activos disponibles.';
    }catch(error){if(root.isConnected&&turno===version){el('pagosEstado').textContent=error.message;el('pagosReintentar').hidden=false;}}
  }
  async function cargarOrdenes(){
    const turno=++version;const elegido=proveedor;
    soltarTemporal();orden=null;ordenes=[];
    el('pagosDetalle').hidden=true;el('pagosOrdenesPanel').hidden=true;el('pagosReintentar').hidden=true;
    el('pagosResumen').hidden=!elegido;resumen();
    if(!elegido){el('pagosEstado').textContent='Selecciona un proveedor para ver sus órdenes.';return;}
    el('pagosEstado').textContent='Cargando órdenes del proveedor…';
    try{
      let registros=cacheOrdenes.get(elegido.id_proveedor);
      if(!registros){
        const encontrados=new Map();
        for(let pagina=1;;pagina++){
          const {data}=await http(`/api/compras-masivas/solicitudes?q=${encodeURIComponent(elegido.razon_social)}&pagina=${pagina}`);
          if(!root.isConnected||turno!==version)return;
          if(!Array.isArray(data.solicitudes)||data.pagina!==pagina||(data.hayMas&&!data.solicitudes.length))throw new Error('No se pudo leer el listado de órdenes completo.');
          for(const o of data.solicitudes)if(o.id_proveedor===elegido.id_proveedor)encontrados.set(o.id_solicitud,o);
          if(!data.hayMas)break;
        }
        registros=[...encontrados.values()];cacheOrdenes.set(elegido.id_proveedor,registros);
      }
      if(!root.isConnected||turno!==version)return;
      ordenes=registros;listado();el('pagosOrdenesPanel').hidden=false;
      el('pagosOrdenesTitulo').textContent=`Órdenes de ${elegido.razon_social}`;
      el('pagosEstado').textContent=ordenes.length?'Selecciona una orden para probar su cotización y abonos.':'';
    }catch(error){if(root.isConnected&&turno===version){el('pagosEstado').textContent=error.message;el('pagosReintentar').hidden=false;}}
  }
  function validarArchivo(file){
    if(!file)return 'Selecciona una imagen o PDF de cotización.';
    const tipos={'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i,'application/pdf':/\.pdf$/i};
    if(!tipos[file.type]?.test(file.name))return 'Selecciona un archivo JPG, JPEG, PNG o PDF válido.';
    if(!file.size||file.size>10*1024*1024)return 'El archivo debe contener datos y no superar los 10 MB.';
    return '';
  }
  el('pagosProveedor').addEventListener('change',()=>{proveedor=proveedores.find(p=>p.id_proveedor===Number(el('pagosProveedor').value))||null;void cargarOrdenes();});
  el('pagosReintentar').addEventListener('click',()=>{if(proveedor)void cargarOrdenes();else void cargarProveedores();});
  root.addEventListener('click',event=>{
    const boton=event.target.closest('[data-pago-orden]');
    if(boton){orden=ordenes.find(o=>o.id_solicitud===Number(boton.dataset.pagoOrden)&&o.id_proveedor===proveedor?.id_proveedor)||null;listado();detalle();return;}
    if(event.target.closest('#pagosAgregarAbono')){
      el('pagosAbonoForm').hidden=!el('pagosAbonoForm').hidden;
      el('pagosAgregarAbono').setAttribute('aria-expanded',String(!el('pagosAbonoForm').hidden));
      if(!el('pagosAbonoForm').hidden)el('pagosAbonoMonto').focus();
    }
  });
  root.addEventListener('input',event=>{if(event.target.id)clearErrors([event.target.id]);});
  root.addEventListener('change',event=>{
    if(event.target.id!=='pagosArchivo')return;
    soltarTemporal();clearErrors(['pagosArchivo']);el('pagosArchivoVista').replaceChildren();
    const file=event.target.files[0],error=validarArchivo(file);
    if(error){setError('pagosArchivo','err-pagosArchivo',error);return;}
    archivoTemporal={file,url:URL.createObjectURL(file)};
    el('pagosArchivoVista').innerHTML=`<p>${esc(file.name)}</p>${file.type.startsWith('image/')?`<img src="${esc(archivoTemporal.url)}" alt="Vista previa de la cotización seleccionada">`:`<a class="btn-link" href="${esc(archivoTemporal.url)}" target="_blank" rel="noopener">Ver PDF seleccionado</a>`}`;
  });
  root.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.target;
    if(!orden||orden.id_proveedor!==proveedor?.id_proveedor||registrando||operaciones.has(form.dataset.operacion))return;
    if(!['pagosCotizacionForm','pagosAbonoForm'].includes(form.id))return;
    registrando=true;
    try{
      const s=simulacion(orden);
      if(form.id==='pagosCotizacionForm'){
        if(s.importe!==null)return;
        clearErrors(['pagosArchivo','pagosImporte']);
        const error=validarArchivo(archivoTemporal?.file),importe=centimos(el('pagosImporte').value);
        if(error)setError('pagosArchivo','err-pagosArchivo',error);
        if(importe===null)setError('pagosImporte','err-pagosImporte','Ingresa un importe mayor que cero, con máximo dos decimales.');
        if(error||importe===null)return;
        s.importe=importe;s.archivo=archivoTemporal;archivoTemporal=null;
        el('pagosEstado').textContent=`Cotización de ${orden.codigo} registrada en la demostración. No se guardó en MySQL.`;
      }else{
        if(s.importe===null)return;
        clearErrors(['pagosAbonoMonto','pagosAbonoFecha','pagosAbonoMetodo']);
        const monto=centimos(el('pagosAbonoMonto').value),fecha=el('pagosAbonoFecha').value,metodo=el('pagosAbonoMetodo').value;
        let valido=true;
        if(monto===null||monto>s.importe-abonado(s)){setError('pagosAbonoMonto','err-pagosAbonoMonto','Ingresa un monto mayor que cero que no supere el saldo pendiente.');valido=false;}
        if(!fecha||!formatDate(fecha)){setError('pagosAbonoFecha','err-pagosAbonoFecha','Selecciona una fecha válida.');valido=false;}
        if(!metodos.includes(metodo)){setError('pagosAbonoMetodo','err-pagosAbonoMetodo','Selecciona un método de pago.');valido=false;}
        if(!valido)return;
        s.abonos.push({monto,fecha,metodo,referencia:el('pagosAbonoReferencia').value.trim()});
        el('pagosEstado').textContent=`Abono de ${soles(monto)} registrado en la demostración para ${orden.codigo}. No se guardó en MySQL.`;
      }
      operaciones.add(form.dataset.operacion);listado();detalle();
    }finally{registrando=false;}
  });
  await cargarProveedores();
}
