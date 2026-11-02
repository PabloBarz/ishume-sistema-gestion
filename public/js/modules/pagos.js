import { http, formatCurrencyPEN, formatDate, clearErrors, setError, openOverlay, closeOverlay, showToast, openImageLightbox, closeImageLightbox } from '../utils.js';
import { esc } from './ordenesCompraUi.js';

// DECIMAL(12,2): cálculo previo en céntimos enteros, sin persistencia.
export function centimos(valor, permitirCero = false) {
  const texto = String(valor).trim().replace(',', '.');
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(texto)) return null;
  const [entero, decimal = ''] = texto.split('.');
  const monto = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(monto) && monto <= 999999999999 && (monto > 0 || permitirCero && monto === 0) ? monto : null;
}
const metodosPago = ['Yape', 'Transferencia'];
const esMasiva = o => Number.isSafeInteger(o?.id_solicitud) && o.id_solicitud > 0 && /^(?:OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$/.test(o.codigo);
const moneda=n=>n===null||n===undefined?'—':formatCurrencyPEN(Number(n));
export function validarArchivo(file) {
  if (!file) return 'Selecciona un documento del proveedor.';
  const tipos = { 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i, 'application/pdf': /\.pdf$/i };
  if (!tipos[file.type]?.test(file.name)) return 'Selecciona un archivo PDF, JPG, JPEG o PNG válido.';
  if (!file.size || file.size > 10 * 1024 * 1024) return 'El archivo debe contener datos y no superar los 10 MB.';
  return '';
}

export async function init() {
  const root = document.getElementById('pagos');
  const el = id => root.querySelector('#' + id);
  let proveedores = [], ordenes = [], proveedor = null, orden = null;
  let version = 0, versionDetalle = 0, archivoUrl = null, activo = true;
  let detalleCargado = null;
  let documentoQuitado=false;
  let economiaActual=null,archivoSeleccionado=null,guardando=false,claveDocumento=crypto.randomUUID(),claveAbono=crypto.randomUUID();
  let solicitada = new URLSearchParams(window.location.hash.split('?')[1] || '').get('orden');
  const localizar = new URLSearchParams(window.location.hash.split('?')[1] || '').get('localizar');
  const modoGeneral = solicitada === null;
  let localizacionActiva=true;
  let abonoCargando=false;
  let permitirEdicion=false;
  // Agrupacion conservada para evaluarla despues; la presentacion actual es plana.
  const agruparPorProveedor=false;
  const gruposAbiertos=new Map();
  let paginaGeneral = 1, hayMasGeneral = false, versionGeneral = 0, temporizadorBusqueda;
  const estado = texto => { el('pagosEstado').textContent = texto; };
  function soltarArchivo() {
    if (archivoUrl) URL.revokeObjectURL(archivoUrl);
    archivoUrl = null;
    el('pagosArchivoVista').replaceChildren();
  }
  function cerrarDetalle(volver = false) {
    if(guardando)return;
    ++versionDetalle;
    closeOverlay('pagosProductos');
    el('pagosProductos').hidden = true;
    if (volver&&!modoGeneral) window.location.hash = '#/pagos';
  }
  function limpiar() {
    activo = false; ++version; ++versionDetalle;
    ++versionGeneral; clearTimeout(temporizadorBusqueda);
    closeImageLightbox(false);soltarArchivo();
    window.removeEventListener('hashchange', limpiar);
    window.removeEventListener('pagehide', limpiar);
  }
  window.addEventListener('hashchange', limpiar);
  window.addEventListener('pagehide', limpiar);
  function reiniciarDetalle() {
    ++versionDetalle; orden = null; detalleCargado = null;
    cerrarDetalle(); soltarArchivo();
    el('pagosDetalle').hidden = true;
    el('pagosCotizacionForm').reset();
    clearErrors(['pagosArchivo', 'pagosImporte', 'pagosAdelanto']);
    economiaActual=null;archivoSeleccionado=null;claveDocumento=crypto.randomUUID();
    el('pagosAdelanto').readOnly=false;el('pagosMotivoCampo').hidden=true;el('pagosMotivo').required=false;
  }
  function calcular() {
    const importe = centimos(el('pagosImporte').value);
    const editando=!!economiaActual?.documento;
    const adelanto = editando?0:centimos(el('pagosAdelanto').value.trim() || '0', true);
    const abonado=editando?centimos(String(economiaActual.abonado),true):adelanto;
    clearErrors(['pagosImporte', 'pagosAdelanto']);
    if (el('pagosImporte').value.trim() && importe === null)
      setError('pagosImporte', 'err-pagosImporte', 'Ingresa un importe positivo con máximo dos decimales.');
    if (adelanto === null || importe !== null && adelanto > importe)
      setError('pagosAdelanto', 'err-pagosAdelanto', 'El adelanto debe ser cero o un importe positivo que no supere el total.');
    el('pagosDatosAdelanto').hidden=!(adelanto>0);
    el('pagosMetodoAdelanto').required=adelanto>0;
    el('pagosCotizacionResumen').hidden=false;
    const etiquetas=el('pagosCotizacionResumen').querySelectorAll('dt');
    etiquetas[0].textContent=editando?'Nuevo importe total':'Total';
    etiquetas[1].textContent=editando?'Abonado acumulado':'Abonado';
    etiquetas[2].textContent=editando?'Nuevo saldo pendiente':'Saldo pendiente';
    if(editando&&importe!==null&&abonado!==null&&importe<abonado)setError('pagosImporte','err-pagosImporte','El importe no puede ser inferior a lo ya abonado.');
    el('pagosCotizacionTotal').textContent=moneda(importe===null?null:importe/100);
    el('pagosCotizacionAbonado').textContent=moneda(abonado===null?null:abonado/100);
    el('pagosCotizacionSaldo').textContent=moneda(importe===null||abonado===null||abonado>importe?null:(importe-abonado)/100);
    return { importe, adelanto, saldo: importe !== null && adelanto !== null && adelanto <= importe ? importe - adelanto : null };
  }
  function accionesPago(o) {
    const cotizada=o.importe!=null;
    const pagada=cotizada&&o.saldo!=null&&centimos(String(o.saldo),true)===0;
    const nombreMas=pagada?'Orden totalmente pagada':cotizada?'Agregar abono':'Registrar cotización';
    return [['abono','plus-lg',nombreMas],['detalle','eye','Ver detalle'],['historial','clock-history','Historial'],['editar','pencil','Editar documento']].filter(([accion])=>accion!=='editar'||permitirEdicion).map(([accion,icono,nombre])=>
      '<button class="btn-icon-outline" type="button" data-pago-accion="'+accion+'" title="'+nombre+'" aria-label="'+nombre+'" '+((accion==='abono'&&pagada||accion==='editar'&&!cotizada)?'disabled':'')+'><i class="bi bi-'+icono+'" aria-hidden="true"></i></button>'
    ).join('');
  }
  async function cargarGeneral(pagina = 1) {
    const turno = ++versionGeneral;
    el('pagosReintentar').hidden = true;
    el('pagosResultados').setAttribute('aria-busy','true');
    el('pagosAnterior').disabled = el('pagosSiguiente').disabled = true;
    estado('Buscando órdenes…');
    try {
      const {data} = await http('/api/pagos/ordenes?q=' + encodeURIComponent(el('pagosBusqueda').value.trim()) + '&pagina=' + pagina);
      if (!activo || !root.isConnected || turno !== versionGeneral) return;
      if (!Array.isArray(data.ordenes) || data.pagina !== pagina || typeof data.economia_disponible!=='boolean') throw new Error('No se pudo leer el listado de órdenes.');
      permitirEdicion=data.permisos?.editar_cotizacion===true;
      el('pagosAviso').hidden=data.economia_disponible;
      const filas = data.ordenes.filter(esMasiva);
      if(agruparPorProveedor){
      const grupos=new Map();
      for(const o of filas){if(!grupos.has(o.id_proveedor))grupos.set(o.id_proveedor,{nombre:o.proveedor,ordenes:[]});grupos.get(o.id_proveedor).ordenes.push(o);}
      el('pagosResultados').innerHTML=[...grupos].map(([id,g])=>{
        const resumen=data.proveedores?.find(p=>p.id_proveedor===id);
        const n=resumen?.cantidad;
        const desconocidas=resumen?n-resumen.cotizadas:null;
        const texto=resumen?(n+' '+(n===1?'orden':'órdenes')+' · Importes registrados: '+moneda(resumen.total)+' · Abonado: '+moneda(resumen.abonado)+' · Saldo: '+moneda(resumen.saldo)+(desconocidas?' · '+desconocidas+' sin cotización':'')):'Importes del proveedor no disponibles';
        const abrir=!!el('pagosBusqueda').value.trim()||(gruposAbiertos.get(id)??true);
        return '<details class="card-panel pagos-proveedor-grupo" data-pago-proveedor="'+id+'" '+(abrir?'open':'')+'><summary><span class="pagos-proveedor-cabecera"><strong>'+esc(g.nombre)+'</strong><span>'+esc(texto)+'</span></span></summary><div class="table-scroll"><table class="table-custom pagos-lista"><thead><tr><th scope="col">Orden</th><th scope="col">Total</th><th scope="col">Abonado</th><th scope="col">Saldo</th><th scope="col">Acciones</th></tr></thead><tbody>'+g.ordenes.map(o=>'<tr data-pago-orden="'+o.id_solicitud+'"><td><strong class="cell-primary">'+esc(o.codigo)+'</strong>'+(o.importe==null?'<span class="cell-secondary">Sin cotización</span>':'')+'</td><td>'+moneda(o.importe)+'</td><td>'+moneda(o.abonado)+'</td><td>'+moneda(o.saldo)+'</td><td><div class="pagos-fila-acciones">'+accionesPago(o)+'</div></td></tr>').join('')+'</tbody></table></div></details>';
      }).join('');
      el('pagosResultados').querySelectorAll('[data-pago-proveedor]').forEach(grupo=>grupo.querySelector('summary').addEventListener('click',()=>{if(!el('pagosBusqueda').value.trim())gruposAbiertos.set(Number(grupo.dataset.pagoProveedor),!grupo.open);}));
      }else{
        el('pagosResultados').innerHTML=filas.length?'<div class="card-panel table-scroll"><table class="table-custom pagos-lista"><thead><tr><th scope="col">Orden / Proveedor</th><th scope="col">Total</th><th scope="col">Abonado</th><th scope="col">Saldo</th><th scope="col">Acciones</th></tr></thead><tbody>'+filas.map(o=>'<tr data-pago-orden="'+o.id_solicitud+'"><td><strong class="cell-primary">'+esc(o.codigo)+'</strong><span class="cell-secondary">'+esc(o.proveedor)+'</span>'+(o.importe==null?'<span class="cell-secondary">Sin cotización</span>':'')+'</td><td>'+moneda(o.importe)+'</td><td>'+moneda(o.abonado)+'</td><td>'+moneda(o.saldo)+'</td><td><div class="pagos-fila-acciones">'+accionesPago(o)+'</div></td></tr>').join('')+'</tbody></table></div>':'';
      }
      paginaGeneral = data.pagina; hayMasGeneral = data.hayMas;
      el('pagosPaginacion').hidden = paginaGeneral === 1 && !hayMasGeneral;
      el('pagosPagina').textContent = 'Página ' + paginaGeneral;
      estado(filas.length ? '' : 'No se encontraron órdenes');
    } catch (error) {
      if (activo && turno === versionGeneral) { el('pagosResultados').replaceChildren(); estado(error.message); showToast(error.message,'error'); el('pagosReintentar').hidden = false; el('pagosPaginacion').hidden = true; }
    } finally {
      if (activo && turno === versionGeneral) {
        el('pagosResultados').setAttribute('aria-busy','false');
        el('pagosAnterior').disabled = paginaGeneral <= 1;
        el('pagosSiguiente').disabled = !hayMasGeneral;
      }
    }
  }
  async function cargarProveedores() {
    const turno = ++version;
    el('pagosReintentar').hidden = true;
    el('pagosProveedor').disabled = true;
    estado('Cargando proveedores…');
    try {
      const { data } = await http('/api/proveedores');
      if (!activo || !root.isConnected || turno !== version) return;
      if (!Array.isArray(data)) throw new Error('No se pudo leer el listado de proveedores.');
      proveedores = data;
      el('pagosProveedor').innerHTML = '<option value="">Selecciona un proveedor</option>' + data.map(p => '<option value="' + p.id_proveedor + '">' + esc(p.razon_social) + '</option>').join('');
      el('pagosProveedor').disabled = !data.length;
      estado(data.length ? '' : 'No hay proveedores activos disponibles.');
      if (solicitada !== null) await preseleccionar();
    } catch (error) {
      if (activo && turno === version) { estado(error.message); showToast(error.message,'error'); el('pagosReintentar').hidden = false; }
    }
  }
  async function cargarOrdenes(idInicial = null) {
    const turno = ++version, elegido = proveedor;
    reiniciarDetalle(); ordenes = [];
    el('pagosOrden').disabled = true;
    el('pagosOrden').innerHTML = '<option value="">Selecciona primero un proveedor</option>';
    el('pagosReintentar').hidden = true;
    if (!elegido) { estado(''); return; }
    el('pagosOrden').innerHTML = '<option value="">Cargando órdenes…</option>';
    estado('Cargando órdenes del proveedor…');
    try {
      const encontrados = new Map();
      for (let pagina = 1; ; pagina++) {
        const { data } = await http('/api/compras-masivas/solicitudes?q=' + encodeURIComponent(elegido.razon_social) + '&pagina=' + pagina);
        if (!activo || !root.isConnected || turno !== version) return;
        if (!Array.isArray(data.solicitudes) || data.pagina !== pagina || data.hayMas && !data.solicitudes.length) throw new Error('No se pudo leer el listado de órdenes completo.');
        for (const o of data.solicitudes) if (o.id_proveedor === elegido.id_proveedor && esMasiva(o)) encontrados.set(o.id_solicitud, o);
        if (!data.hayMas) break;
      }
      ordenes = [...encontrados.values()];
      el('pagosOrden').innerHTML = '<option value="">Selecciona una orden de compra</option>' + ordenes.map(o => '<option value="' + o.id_solicitud + '">' + esc(o.codigo) + '</option>').join('');
      el('pagosOrden').disabled = !ordenes.length;
      estado(ordenes.length ? '' : 'Este proveedor no tiene órdenes OC-MAS disponibles.');
      if (idInicial !== null) {
        if (!ordenes.some(o => o.id_solicitud === idInicial)) throw new Error('La orden solicitada no está disponible para este proveedor.');
        el('pagosOrden').value = String(idInicial);
        seleccionarOrden();
      }
    } catch (error) {
      if (activo && turno === version) {
        el('pagosOrden').innerHTML = '<option value="">No se pudo cargar</option>';
        estado(error.message); showToast(error.message,'error'); el('pagosReintentar').hidden = false;
      }
    }
  }
  async function preseleccionar() {
    if (!/^[1-9][0-9]*$/.test(solicitada || '') || Number(solicitada) > 2147483647) {
      estado('El identificador de la orden no es válido. Selecciona una orden de compra.'); return;
    }
    const turno = ++version;
    el('pagosProveedor').disabled = true;
    el('pagosReintentar').hidden = true;
    estado('Consultando la orden seleccionada…');
    try {
      const {data} = await http('/api/compras-masivas/solicitudes/' + solicitada);
      if (!activo || !root.isConnected || turno !== version) return;
      if (!esMasiva(data) || data.id_solicitud !== Number(solicitada)) throw new Error('La selección no corresponde a una orden de compra masiva OC-MAS.');
      let elegido = proveedores.find(p => p.id_proveedor === data.id_proveedor);
      if (!elegido) {
        if (!Number.isInteger(data.id_proveedor) || data.id_proveedor < 1 || typeof data.proveedor !== 'string') throw new Error('No se pudo verificar el proveedor de esta orden.');
        elegido = {id_proveedor:data.id_proveedor,razon_social:data.proveedor};
        proveedores.push(elegido);
        const opcion = document.createElement('option'); opcion.value = String(elegido.id_proveedor); opcion.textContent = elegido.razon_social + ' (solo consulta)'; el('pagosProveedor').append(opcion);
      }
      proveedor = elegido;
      el('pagosProveedor').value = String(elegido.id_proveedor);
      ordenes = [data];
      el('pagosOrden').innerHTML = `<option value="${data.id_solicitud}">${esc(data.codigo)}</option>`;
      el('pagosOrden').disabled = false;
      await seleccionarOrden(data);
    } catch (error) {
      if (activo && turno === version) { estado(error.message); showToast(error.message,'error'); el('pagosReintentar').hidden = false; }
    } finally {
      if (activo && root.isConnected) el('pagosProveedor').disabled = !proveedores.length;
    }
  }
  function seleccionManual() {
    solicitada = null;
    window.history.replaceState(null, '', '#/pagos');
  }
  el('pagosProveedor').addEventListener('change', () => {
    seleccionManual();
    proveedor = proveedores.find(p => p.id_proveedor === Number(el('pagosProveedor').value)) || null;
    void cargarOrdenes();
  });
  async function seleccionarOrden(datosIniciales = null) {
    const id = Number(el('pagosOrden').value);
    reiniciarDetalle();
    orden = ordenes.find(o => o.id_solicitud === id && o.id_proveedor === proveedor?.id_proveedor) || null;
    if (!orden) return;
    el('pagosDetalle').hidden = false;
    estado('');
    window.history.replaceState(null, '', '#/pagos?orden=' + orden.id_solicitud);
    await mostrarDetalle(datosIniciales);
  }
  el('pagosOrden').addEventListener('change', () => { seleccionManual(); seleccionarOrden(); });
  el('pagosReintentar').addEventListener('click', () => { if (modoGeneral) void cargarGeneral(paginaGeneral); else if (solicitada !== null && proveedores.length) void preseleccionar(); else if (proveedor) void cargarOrdenes(); else void cargarProveedores(); });
  el('pagosBusqueda').addEventListener('input', () => { ++versionGeneral; clearTimeout(temporizadorBusqueda); temporizadorBusqueda = setTimeout(() => { if (activo) void cargarGeneral(); },300); });
  el('pagosBuscador').addEventListener('submit', event => { event.preventDefault(); clearTimeout(temporizadorBusqueda); void cargarGeneral(); });
  el('pagosAnterior').addEventListener('click', () => { if (paginaGeneral > 1) void cargarGeneral(paginaGeneral-1); });
  el('pagosSiguiente').addEventListener('click', () => { if (hayMasGeneral) void cargarGeneral(paginaGeneral+1); });
  el('pagosAdjuntar').addEventListener('click', () => el('pagosArchivo').click());
  el('pagosImporte').addEventListener('input', calcular);
  el('pagosAdelanto').addEventListener('input', calcular);
  el('pagosArchivo').addEventListener('change', () => {
    soltarArchivo(); clearErrors(['pagosArchivo']);
    const file = el('pagosArchivo').files[0], error = validarArchivo(file);
    archivoSeleccionado=null;
    if (error) { setError('pagosArchivo', 'err-pagosArchivo', error); return; }
    archivoSeleccionado=file;
    archivoUrl = URL.createObjectURL(file);
    mostrarArchivoFormulario(file.name,file.type,archivoUrl);
  });
  function mostrarArchivoFormulario(nombre,mime,url) {
    el('pagosArchivoVista').innerHTML='<div class="pagos-documento-seleccionado"><button class="pagos-quitar-documento" type="button" data-quitar-documento title="Quitar documento" aria-label="Quitar documento"><i class="bi bi-x-lg" aria-hidden="true"></i></button><p>'+esc(nombre)+'</p>'+(mime.startsWith('image/')?imagenAdjunta(url,'Documento del proveedor'):'<i class="bi bi-file-earmark-pdf pagos-pdf-icono" aria-hidden="true"></i><a class="btn-link" href="'+esc(url)+'" target="_blank" rel="noopener">Ver PDF</a>')+'</div>';
  }
  el('pagosArchivoVista').addEventListener('click',event=>{
    if(!event.target.closest('[data-quitar-documento]')||guardando)return;
    event.preventDefault();event.stopPropagation();
    soltarArchivo();archivoSeleccionado=null;documentoQuitado=true;el('pagosArchivo').value='';
    clearErrors(['pagosArchivo']);el('pagosAdjuntar').focus({preventScroll:true});
  });
  function imagenAdjunta(url,alt) {
    return '<div class="pagos-miniatura"><div class="pagos-imagen-area"><button class="pagos-imagen-toggle" type="button" data-ampliar-imagen aria-expanded="false" aria-label="Ampliar imagen"><img src="'+esc(url)+'" alt="'+esc(alt)+'" draggable="false"></button></div><button class="btn-link" type="button" data-ampliar-imagen aria-expanded="false">Ampliar</button></div>';
  }
  el('pagosDetalle').addEventListener('click',event=>{
    const boton=event.target.closest('[data-ampliar-imagen]');if(!boton||guardando)return;
    const img=boton.closest('.pagos-miniatura').querySelector('img');
    try {openImageLightbox(img.src,{trigger:boton,alt:img.alt});}catch(error){showToast(error.message,'error');}
  });
  function vistaPago(vista) {
    el('pagosCotizacionForm').hidden=vista!=='documento';
    el('pagosSeguimiento').hidden=vista!=='seguimiento';
    el('pagosAbonoForm').hidden=vista!=='abono';
    el('pagosHistorial').hidden=true;
    el('pagosHistorialSolo').hidden=vista!=='historial';
    el('pagosGuardar').hidden=vista!=='documento';
    el('pagosAbonoGuardar').hidden=vista!=='abono';
    el('pagosModalCerrar').textContent=vista==='abono'||vista==='documento'?'Cancelar':'Cerrar';
    el('pagosProductos').classList.toggle('pagos-modal-abono',vista==='abono');
    el('pagosProductos').classList.toggle('pagos-modal-cotizacion',vista==='documento');
  }
  function presentarEconomia(data) {
    economiaActual=data;
    el('pagosProductos').querySelector('.modal-body-custom > .pagos-limitacion').hidden=data.habilitado;
    el('pagosGuardar').disabled=!data.habilitado;
    vistaPago('seguimiento');
    const doc=data.documento;
    el('pagosArchivoGuardado').innerHTML=!doc?'<p>Sin documento registrado.</p>':'<p>'+esc(doc.nombre)+'</p>'+(doc.mime.startsWith('image/')?imagenAdjunta(doc.url,'Documento guardado'):'<a class="btn-link" href="'+esc(doc.url)+'" target="_blank" rel="noopener">Ver PDF</a>');
    const pagos=Array.isArray(data.historial)?[...data.historial]:[];
    pagos.sort((a,b)=>String(a.fecha_pago).localeCompare(String(b.fecha_pago))||(Number(a.id_abono)||0)-(Number(b.id_abono)||0));
    const ultimo=pagos.at(-1);
    el('pagosUltimoAbono').textContent=ultimo?moneda(ultimo.monto)+' · '+ultimo.metodo_pago+' · '+formatDate(ultimo.fecha_pago):Array.isArray(data.historial)?'Aún no se registraron abonos':'Historial no disponible.';
    el('pagosVerHistorial').disabled=!Array.isArray(data.historial);
    el('pagosTotalReal').textContent=moneda(data.importe);el('pagosAbonadoReal').textContent=moneda(data.abonado);el('pagosSaldoReal').textContent=moneda(data.saldo);
  }
  function ocupacion(valor) {
    guardando=valor;
    for(const id of ['pagosProductosCerrar','pagosModalCerrar','pagosAbonoGuardar'])el(id).disabled=valor;
    el('pagosGuardar').disabled=valor||!economiaActual?.habilitado;

  }
  el('pagosCotizacionForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(guardando)return;
    if(!economiaActual?.habilitado){el('pagosModalEstado').textContent='Falta preparar la base de datos de Pagos.';return;}
    const importes=calcular();
    if(importes.importe===null||importes.adelanto===null||importes.saldo===null){showToast('Revisa el importe y el adelanto.','warning');return;}
    if(!archivoSeleccionado&&(!economiaActual.documento||documentoQuitado)){setError('pagosArchivo','err-pagosArchivo','Selecciona una imagen o PDF.');showToast('Selecciona una imagen o PDF.','warning');return;}
    if(importes.adelanto>0&&!metodosPago.includes(el('pagosMetodoAdelanto').value)){el('pagosModalEstado').textContent='Selecciona el método del adelanto.';return;}
    if(economiaActual.documento&&(!el('pagosMotivo').value.trim()||importes.importe<centimos(String(economiaActual.abonado),true))){el('pagosModalEstado').textContent='Indica el motivo y un importe que cubra los abonos registrados.';return;}
    const datos={clave_operacion:claveDocumento,importe:(importes.importe/100).toFixed(2),adelanto:(importes.adelanto/100).toFixed(2),metodo_pago:importes.adelanto>0?el('pagosMetodoAdelanto').value:'',version_esperada:economiaActual.documento?.version??0,motivo:el('pagosMotivo').value.trim()};
    ocupacion(true);el('pagosModalEstado').textContent='Guardando documento…';
    try{
      const r=await fetch('/api/pagos/ordenes/'+orden.id_solicitud+'/documento',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Pagos-Datos':encodeURIComponent(JSON.stringify(datos)),'X-Pagos-Nombre':encodeURIComponent(archivoSeleccionado?.name||''),'X-Pagos-Mime':archivoSeleccionado?.type||''},body:archivoSeleccionado||new Uint8Array(),signal:AbortSignal.timeout(30000)});
      const respuesta=await r.json();if(!r.ok)throw Error(respuesta.message||'No se pudo guardar el documento.');
      if(!activo||!root.isConnected)return;
      economiaActual=respuesta.data;claveDocumento=crypto.randomUUID();soltarArchivo();archivoSeleccionado=null;
      ocupacion(false);cerrarDetalle();
      el('pagosModalEstado').textContent='';
      await cargarGeneral(paginaGeneral);
      showToast(datos.version_esperada>0?'Cambios actualizados':'Cotizaci\u00f3n registrada','success');
    }catch(e){if(activo){el('pagosModalEstado').textContent=e.message+' Puedes reintentar sin duplicar la operaci\u00f3n.';showToast(e.message,'error');}}finally{if(activo)ocupacion(false);}
  });
  function prepararDocumento() {
    soltarArchivo();archivoSeleccionado=null;documentoQuitado=false;claveDocumento=crypto.randomUUID();
    el('pagosCotizacionForm').reset();clearErrors(['pagosArchivo','pagosImporte','pagosAdelanto']);
    const existe=!!economiaActual.documento;
    el('pagosImporte').value=existe?economiaActual.importe:'';el('pagosAdelanto').value='';el('pagosAdelanto').readOnly=existe;el('pagosAdelantoCampo').hidden=existe;
    el('pagosMotivoCampo').hidden=!existe;el('pagosMotivo').required=existe;
    if(existe)mostrarArchivoFormulario(economiaActual.documento.nombre,economiaActual.documento.mime,economiaActual.documento.url);
    el('pagosProductosTitulo').textContent=existe?'Editar cotizaci\u00f3n':'Registrar cotizaci\u00f3n';
    el('pagosProveedorNombre').textContent=orden.codigo+' \u00b7 '+orden.proveedor;
    el('pagosGuardar').textContent=existe?'Guardar cambios':'Guardar cotizaci\u00f3n';
    vistaPago('documento');calcular();el('pagosGuardar').disabled=!economiaActual.habilitado;
  }
  el('pagosResultados').addEventListener('click',async event=>{
    const boton=event.target.closest('[data-pago-accion]');
    if(!boton||guardando||abonoCargando||boton.disabled)return;
    const accion=boton.dataset.pagoAccion;if(accion==='editar'&&!permitirEdicion)return;let consultada=null;abonoCargando=true;boton.disabled=true;
    try {
      const id=Number(boton.closest('[data-pago-orden]').dataset.pagoOrden);
      const {data}=await http('/api/pagos/ordenes/'+id);
      if(!activo||!root.isConnected)return;
      if(data.id_solicitud!==id||!esMasiva(data))throw Error('Orden no valida.');
      consultada=data;
      const cotizada=!!data.documento&&data.importe!=null;
      if((accion==='abono'||accion==='editar')&&!data.habilitado)throw Error('Falta preparar la base de datos de Pagos.');
      if(accion==='editar'&&!cotizada)throw Error('Registra primero la cotizaci\u00f3n con el bot\u00f3n +.');
      if(accion==='abono'&&cotizada&&centimos(String(data.saldo),true)===0)throw Error('Esta orden no tiene saldo pendiente.');
      orden=data;economiaActual=data;el('pagosProductosTitulo').textContent=data.codigo;el('pagosProveedorNombre').textContent=data.proveedor;
      el('pagosModalEstado').textContent='';el('pagosProductos').querySelector('.pagos-limitacion').hidden=data.habilitado;
      if(accion==='abono'&&!cotizada)prepararDocumento();
      else if(accion==='abono'){el('pagosProductosTitulo').textContent='Registrar abono';
        el('pagosProveedorNombre').textContent=data.codigo+' \u00b7 '+data.proveedor;
        el('pagosAbonoResumen').innerHTML='<div><dt>Total acordado</dt><dd>'+moneda(data.importe)+'</dd></div><div><dt>Abonado acumulado</dt><dd>'+moneda(data.abonado)+'</dd></div><div><dt>Saldo actual</dt><dd>'+moneda(data.saldo)+'</dd></div>';
        claveAbono=crypto.randomUUID();el('pagosAbonoForm').reset();clearErrors(['pagosAbonoMonto']);vistaPago('abono');actualizarSaldoEstimado();}
      else if(accion==='editar')prepararDocumento();
      else if(accion==='historial')mostrarHistorial();
      else presentarEconomia(data);
      el('pagosDetalle').hidden=false;el('pagosProductos').hidden=false;openOverlay('pagosProductos');
      if(accion==='abono'&&cotizada)el('pagosAbonoMonto').focus();else if(accion==='editar'||accion==='abono')el('pagosImporte').focus();
    }catch(e){if(activo){estado(e.message);showToast(e.message,'error');}}
    finally{abonoCargando=false;if(boton.isConnected){boton.disabled=!!consultada&&(accion==='abono'&&consultada.importe!=null&&centimos(String(consultada.saldo),true)===0||accion==='editar'&&!consultada.documento);}}
  });
  function actualizarSaldoEstimado() {
    const monto=centimos(el('pagosAbonoMonto').value);
    const saldo=economiaActual?.saldo==null?null:centimos(String(economiaActual.saldo),true);
    el('pagosAbonoEstimado').textContent=moneda(monto===null||saldo===null||monto>saldo?null:(saldo-monto)/100);
  }
  el('pagosAbonoMonto').addEventListener('input',()=>{clearErrors(['pagosAbonoMonto']);actualizarSaldoEstimado();});
  el('pagosAbonoForm').addEventListener('submit',async event=>{
    event.preventDefault();if(guardando||!economiaActual?.documento)return;
    clearErrors(['pagosAbonoMonto']);
    const monto=centimos(el('pagosAbonoMonto').value);
    if(monto===null||monto>centimos(String(economiaActual.saldo),true)){el('pagosModalEstado').textContent='Ingresa un abono positivo que no supere el saldo.';setError('pagosAbonoMonto','err-pagosAbonoMonto',el('pagosModalEstado').textContent);showToast(el('pagosModalEstado').textContent,'warning');return;}
    if(!metodosPago.includes(el('pagosAbonoMetodo').value)){el('pagosModalEstado').textContent='Selecciona el m\u00e9todo del abono.';return;}
    ocupacion(true);el('pagosModalEstado').textContent='Registrando abono…';
    try{
      const {data}=await http('/api/pagos/ordenes/'+orden.id_solicitud+'/abonos','POST',{clave_operacion:claveAbono,monto:(monto/100).toFixed(2),metodo_pago:el('pagosAbonoMetodo').value});
      if(!activo||!root.isConnected)return;economiaActual=data;
      ocupacion(false);cerrarDetalle();await cargarGeneral(paginaGeneral);showToast('Abono registrado','success');
    }catch(e){if(activo){el('pagosModalEstado').textContent=e.message;showToast(e.message,'error');}}finally{if(activo)ocupacion(false);}
  });
  function mostrarHistorial() {
    vistaPago('historial');el('pagosProductosTitulo').textContent='Historial de abonos';
    el('pagosProveedorNombre').textContent=orden.codigo+' · '+orden.proveedor;
    renderHistorial(el('pagosHistorialSolo'),false);
  }
  el('pagosVerHistorial').addEventListener('click',()=>{if(!guardando&&economiaActual)mostrarHistorial();});
  function renderHistorial(destino=el('pagosHistorial'),titulo=true) {
    if(!Array.isArray(economiaActual.historial)){destino.innerHTML='<p>Historial no disponible: falta preparar el esquema de Pagos.</p>';return;}
    const filas=economiaActual.historial||[],referencia=filas.some(a=>a.numero_operacion);
    destino.innerHTML=(titulo?'<h3 class="panel-title">Historial de pagos</h3>':'')+(filas.length?'<table class="table-custom pagos-historial-tabla"><thead><tr><th>Fecha</th><th>Importe</th><th>Método</th>'+(referencia?'<th>Referencia</th>':'')+'</tr></thead><tbody>'+filas.map(a=>'<tr><td>'+esc(formatDate(a.fecha_pago))+'</td><td>'+moneda(a.monto)+'</td><td>'+esc(a.metodo_pago)+'</td>'+(referencia?'<td>'+esc(a.numero_operacion||'—')+'</td>':'')+'</tr>').join('')+'</tbody></table>':'<p>A\u00fan no se registraron abonos</p>');
  }
  async function mostrarDetalle(datosIniciales = null) {
    if (!orden) return;
    const seleccionada = orden, turno = ++versionDetalle;
    el('pagosDetalle').hidden = true;
    el('pagosProductosTitulo').textContent = seleccionada.codigo;el('pagosProveedorNombre').textContent=seleccionada.proveedor||proveedor?.razon_social||'';
    el('pagosModalEstado').textContent = 'Consultando la orden…';
    el('pagosProductos').hidden = false; openOverlay('pagosProductos');
    try {
      const data = datosIniciales || detalleCargado || (await http('/api/compras-masivas/solicitudes/' + seleccionada.id_solicitud)).data;
      if (!activo || !root.isConnected || turno !== versionDetalle) return;
      if (data.id_solicitud !== seleccionada.id_solicitud || data.id_proveedor !== proveedor.id_proveedor || data.codigo !== seleccionada.codigo || !Array.isArray(data.distribuciones))
        throw new Error('El detalle no corresponde a la orden seleccionada.');
      detalleCargado = data;
      const respuesta = await http('/api/pagos/ordenes/' + seleccionada.id_solicitud);
      if(!activo||turno!==versionDetalle)return;
      if(respuesta.data.id_solicitud!==seleccionada.id_solicitud)throw Error('La información económica no corresponde a la orden.');
      presentarEconomia(respuesta.data);
      el('pagosDetalle').hidden = false; el('pagosModalEstado').textContent = ''; estado('');
    } catch (error) {
      if (activo && turno === versionDetalle) { estado(error.message); el('pagosModalEstado').textContent = error.message;showToast(error.message,'error'); }
    }
  }
  el('pagosProductosCerrar').addEventListener('click', () => cerrarDetalle(true));
  el('pagosModalCerrar').addEventListener('click', () => cerrarDetalle(true));
  el('pagosProductos').addEventListener('click', event => { if (event.target === el('pagosProductos')) { cerrarDetalle(true); } });
  el('pagosProductos').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); cerrarDetalle(true); }
    if (event.key === 'Tab') {
      const controles = [...el('pagosProductos').querySelectorAll('button:not(:disabled), input:not([hidden]), select, a[href]')].filter(n=>n.getClientRects().length);
      const primero=controles[0],ultimo=controles.at(-1);
      if(event.shiftKey&&document.activeElement===primero){event.preventDefault();ultimo?.focus();}
      else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primero?.focus();}
    }
  });
  el('pagosBusqueda').addEventListener('input',()=>{localizacionActiva=false;});
  el('pagosAnterior').addEventListener('click',()=>{localizacionActiva=false;});
  el('pagosSiguiente').addEventListener('click',()=>{localizacionActiva=false;});
  el('pagosGeneral').hidden = !modoGeneral;
  el('pagosSeleccion').hidden = true;
  el('pagosVolver').hidden = true;
  if (modoGeneral) {
    await cargarGeneral();
    if(localizar!==null)await localizarFila();
  } else await cargarProveedores();
  async function localizarFila() {
    if(!/^[1-9][0-9]*$/.test(localizar)||Number(localizar)>2147483647){estado('Orden no encontrada.');return;}
    const id=Number(localizar);
    try {
      const {data}=await http('/api/pagos/ordenes/'+id);
      if(data.id_solicitud!==id)throw Error('Orden no encontrada.');
      let fila=el('pagosResultados').querySelector('[data-pago-orden="'+id+'"]');
      while(!fila&&hayMasGeneral&&activo&&localizacionActiva){
        await cargarGeneral(paginaGeneral+1);
        if(el('pagosReintentar').hidden===false)return;
        fila=el('pagosResultados').querySelector('[data-pago-orden="'+id+'"]');
      }
      if(!activo||!localizacionActiva)return;
      if(!fila){await cargarGeneral(1);estado('Orden no encontrada.');return;}
      const grupo=fila.closest('details');if(grupo)grupo.open=true;
      fila.classList.add('pago-localizado');fila.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      setTimeout(()=>fila.classList.remove('pago-localizado'),4000);
    }catch(e){if(activo&&localizacionActiva)estado('Orden no encontrada.');}
  }

}
