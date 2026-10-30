import { http, formatCurrencyPEN, formatDate, clearErrors, setError, openOverlay, closeOverlay } from '../utils.js';
import { esc } from './ordenesCompraUi.js';

// DECIMAL(12,2): cálculo previo en céntimos enteros, sin persistencia.
export function centimos(valor, permitirCero = false) {
  const texto = String(valor).trim().replace(',', '.');
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(texto)) return null;
  const [entero, decimal = ''] = texto.split('.');
  const monto = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(monto) && monto <= 999999999999 && (monto > 0 || permitirCero && monto === 0) ? monto : null;
}
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
  let economiaActual=null,archivoSeleccionado=null,guardando=false,motivoCorreccion='',claveDocumento=crypto.randomUUID(),claveAbono=crypto.randomUUID();
  let solicitada = new URLSearchParams(window.location.hash.split('?')[1] || '').get('orden');
  const modoGeneral = solicitada === null;
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
    if (volver) window.location.hash = '#/pagos';
  }
  function limpiar() {
    activo = false; ++version; ++versionDetalle;
    ++versionGeneral; clearTimeout(temporizadorBusqueda);
    soltarArchivo();
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
    economiaActual=null;archivoSeleccionado=null;motivoCorreccion='';claveDocumento=crypto.randomUUID();
    el('pagosAdelanto').readOnly=false;
  }
  function calcular() {
    const importe = centimos(el('pagosImporte').value);
    const adelanto = centimos(el('pagosAdelanto').value, true);
    clearErrors(['pagosImporte', 'pagosAdelanto']);
    if (el('pagosImporte').value.trim() && importe === null)
      setError('pagosImporte', 'err-pagosImporte', 'Ingresa un importe positivo con máximo dos decimales.');
    if (adelanto === null || importe !== null && adelanto > importe)
      setError('pagosAdelanto', 'err-pagosAdelanto', 'El adelanto debe ser cero o un importe positivo que no supere el total.');
    el('pagosDatosAdelanto').hidden=!(adelanto>0);
    el('pagosFechaAdelanto').required=el('pagosMetodoAdelanto').required=adelanto>0;
    return { importe, adelanto, saldo: importe !== null && adelanto !== null && adelanto <= importe ? importe - adelanto : null };
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
      el('pagosAviso').hidden=data.economia_disponible;
      const filas = data.ordenes.filter(esMasiva);
      el('pagosResultados').innerHTML = filas.length ? `<div class="card-panel table-scroll"><table class="table-custom pagos-lista"><thead><tr><th scope="col">Orden / Proveedor</th><th scope="col">Total</th><th scope="col">Abonado</th><th scope="col">Saldo</th><th scope="col">Acciones</th></tr></thead><tbody>${filas.map(o => `<tr><td><strong class="cell-primary">${esc(o.codigo)}</strong><span class="cell-secondary">${esc(o.proveedor)}</span></td><td>${moneda(o.importe)}</td><td>${moneda(o.abonado)}</td><td>${moneda(o.saldo)}</td><td><a class="btn-icon-outline" href="#/pagos?orden=${o.id_solicitud}" aria-label="Ver detalle de ${esc(o.codigo)}"><i class="bi bi-eye" aria-hidden="true"></i></a></td></tr>`).join('')}</tbody></table></div>` : '';
      paginaGeneral = data.pagina; hayMasGeneral = data.hayMas;
      el('pagosPaginacion').hidden = paginaGeneral === 1 && !hayMasGeneral;
      el('pagosPagina').textContent = 'Página ' + paginaGeneral;
      estado(filas.length ? '' : 'No se encontraron órdenes');
    } catch (error) {
      if (activo && turno === versionGeneral) { el('pagosResultados').replaceChildren(); estado(error.message); el('pagosReintentar').hidden = false; el('pagosPaginacion').hidden = true; }
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
      if (activo && turno === version) { estado(error.message); el('pagosReintentar').hidden = false; }
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
        estado(error.message); el('pagosReintentar').hidden = false;
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
      if (activo && turno === version) { estado(error.message); el('pagosReintentar').hidden = false; }
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
    el('pagosArchivoVista').innerHTML = '<p>' + esc(file.name) + '</p>' +
      (file.type.startsWith('image/') ? '<div class="pagos-miniatura"><img src="' + esc(archivoUrl) + '" alt="Miniatura del documento"><a class="btn-link" href="' + esc(archivoUrl) + '" target="_blank" rel="noopener">Ampliar imagen</a></div>' :
        '<a class="btn-link" href="' + esc(archivoUrl) + '" target="_blank" rel="noopener">Ver PDF seleccionado</a>');
  });
  function vistaPago(vista) {
    el('pagosCotizacionForm').hidden=vista!=='documento';
    el('pagosSeguimiento').hidden=vista!=='seguimiento';
    el('pagosAbonoForm').hidden=vista!=='abono';
    el('pagosHistorial').hidden=vista!=='historial';
    el('pagosGuardar').hidden=vista!=='documento';
    el('pagosSeguimientoVolver').hidden=!['abono','historial'].includes(vista);
  }
  function presentarEconomia(data) {
    economiaActual=data;
    el('pagosProductos').querySelector('.modal-body-custom > .pagos-limitacion').hidden=data.habilitado;
    el('pagosGuardar').disabled=!data.habilitado;
    if(!data.documento){vistaPago('documento');return;}
    vistaPago('seguimiento');
    const doc=data.documento;
    el('pagosArchivoGuardado').innerHTML='<p>'+esc(doc.nombre)+'</p>'+(doc.mime.startsWith('image/')?'<div class="pagos-miniatura"><img src="'+esc(doc.url)+'" alt="Documento guardado"><a class="btn-link" href="'+esc(doc.url)+'" target="_blank" rel="noopener">Ampliar imagen</a></div>':'<a class="btn-link" href="'+esc(doc.url)+'" target="_blank" rel="noopener">Ver PDF</a>');
    el('pagosTotalReal').textContent=moneda(data.importe);el('pagosAbonadoReal').textContent=moneda(data.abonado);el('pagosSaldoReal').textContent=moneda(data.saldo);
    el('pagosEstadoReal').textContent=data.estado_economico;
    el('pagosProgreso').value=data.porcentaje;el('pagosProgreso').title=data.porcentaje+' % abonado';
    el('pagosNuevoAbono').disabled=centimos(String(data.saldo),true)===0;
  }
  function ocupacion(valor) {
    guardando=valor;
    for(const id of ['pagosProductosCerrar','pagosModalCerrar','pagosAbonoGuardar','pagosCorregir','pagosSeguimientoVolver'])el(id).disabled=valor;
    el('pagosGuardar').disabled=valor||!economiaActual?.habilitado;
    el('pagosNuevoAbono').disabled=valor||economiaActual?.saldo==='0.00';
  }
  el('pagosCotizacionForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(guardando)return;
    if(!economiaActual?.habilitado){el('pagosModalEstado').textContent='Falta preparar la base de datos de Pagos.';return;}
    const importes=calcular();
    if(importes.importe===null||importes.adelanto===null||importes.saldo===null)return;
    if(!archivoSeleccionado){setError('pagosArchivo','err-pagosArchivo','Selecciona una imagen o PDF.');return;}
    if(importes.adelanto>0&&(!el('pagosFechaAdelanto').value||!el('pagosMetodoAdelanto').value)){el('pagosModalEstado').textContent='Completa la fecha y el método del adelanto.';return;}
    const datos={clave_operacion:claveDocumento,importe:(importes.importe/100).toFixed(2),adelanto:(importes.adelanto/100).toFixed(2),fecha_documento:el('pagosFechaCotizacion').value||null,fecha_pago:el('pagosFechaAdelanto').value,metodo_pago:el('pagosMetodoAdelanto').value,version_esperada:economiaActual.documento?.version??0,motivo:motivoCorreccion};
    ocupacion(true);el('pagosModalEstado').textContent='Guardando documento…';
    try{
      const r=await fetch('/api/pagos/ordenes/'+orden.id_solicitud+'/documento',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Pagos-Datos':encodeURIComponent(JSON.stringify(datos)),'X-Pagos-Nombre':encodeURIComponent(archivoSeleccionado.name),'X-Pagos-Mime':archivoSeleccionado.type},body:archivoSeleccionado,signal:AbortSignal.timeout(30000)});
      const respuesta=await r.json();if(!r.ok)throw Error(respuesta.message||'No se pudo guardar el documento.');
      if(!activo||!root.isConnected)return;
      presentarEconomia(respuesta.data);claveDocumento=crypto.randomUUID();soltarArchivo();archivoSeleccionado=null;
      el('pagosModalEstado').textContent='Documento guardado correctamente.';
      await cargarGeneral(paginaGeneral);
    }catch(e){if(activo)el('pagosModalEstado').textContent=e.message+' Puedes reintentar sin duplicar la operación.';}finally{if(activo)ocupacion(false);}
  });
  el('pagosNuevoAbono').addEventListener('click',()=>{
    if(!economiaActual?.documento||economiaActual.saldo==='0.00'||guardando)return;
    claveAbono=crypto.randomUUID();el('pagosAbonoForm').reset();vistaPago('abono');el('pagosModalEstado').textContent='';
    el('pagosAbonoMonto').focus();
  });
  el('pagosAbonoForm').addEventListener('submit',async event=>{
    event.preventDefault();if(guardando||!economiaActual?.documento)return;
    const monto=centimos(el('pagosAbonoMonto').value);
    if(monto===null||monto>centimos(String(economiaActual.saldo),true)){el('pagosModalEstado').textContent='Ingresa un abono positivo que no supere el saldo.';return;}
    ocupacion(true);el('pagosModalEstado').textContent='Registrando abono…';
    try{
      const {data}=await http('/api/pagos/ordenes/'+orden.id_solicitud+'/abonos','POST',{clave_operacion:claveAbono,monto:(monto/100).toFixed(2),fecha_pago:el('pagosAbonoFecha').value,metodo_pago:el('pagosAbonoMetodo').value,numero_operacion:el('pagosAbonoOperacion').value.trim()});
      if(!activo)return;presentarEconomia(data);el('pagosModalEstado').textContent='Abono registrado correctamente.';await cargarGeneral(paginaGeneral);
    }catch(e){if(activo)el('pagosModalEstado').textContent=e.message;}finally{if(activo)ocupacion(false);}
  });
  el('pagosVerHistorial').addEventListener('click',()=>{
    if(!economiaActual?.documento)return;vistaPago('historial');
    const filas=economiaActual.historial;
    el('pagosHistorial').innerHTML='<h3 class="panel-title">Historial de pagos</h3>'+(filas.length?'<table class="table-custom compras-tabla"><thead><tr><th>Fecha / Método</th><th>Operación</th><th>Importe</th></tr></thead><tbody>'+filas.map(a=>'<tr><td>'+esc(formatDate(a.fecha_pago))+'<span class="cell-secondary">'+esc(a.metodo_pago)+'</span></td><td>'+esc(a.numero_operacion||'—')+'</td><td>'+moneda(a.monto)+(a.motivo_anulacion?'<small>Anulado</small>':'')+'</td></tr>').join('')+'</tbody></table>':'<p>No se han registrado abonos.</p>')+'<p class="text-sm">Total abonado: '+moneda(economiaActual.abonado)+' · Saldo: '+moneda(economiaActual.saldo)+'</p>';
  });
  el('pagosSeguimientoVolver').addEventListener('click',()=>{presentarEconomia(economiaActual);el('pagosModalEstado').textContent='';});
  el('pagosCorregir').addEventListener('click',async()=>{
    if(guardando||!economiaActual?.documento)return;
    const motivo=window.prompt('Motivo de la corrección (se conservará el documento anterior):');
    if(!motivo?.trim())return;
    ocupacion(true);
    try{
      const r=await fetch(economiaActual.documento.url);if(!r.ok)throw Error('No se pudo recuperar el documento anterior.');
      archivoSeleccionado=new File([await r.blob()],economiaActual.documento.nombre,{type:economiaActual.documento.mime});
      motivoCorreccion=motivo.trim();claveDocumento=crypto.randomUUID();
      el('pagosImporte').value=economiaActual.importe;el('pagosAdelanto').value='0.00';el('pagosAdelanto').readOnly=true;
      el('pagosFechaCotizacion').value=economiaActual.documento.fecha||'';
      vistaPago('documento');calcular();el('pagosModalEstado').textContent='Corrección: se conservará la versión anterior. Puedes adjuntar otro archivo.';
    }catch(e){el('pagosModalEstado').textContent=e.message;}finally{ocupacion(false);}
  });
  async function mostrarDetalle(datosIniciales = null) {
    if (!orden) return;
    const seleccionada = orden, turno = ++versionDetalle;
    el('pagosDetalle').hidden = true;
    el('pagosProductosTitulo').textContent = seleccionada.codigo;
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
      if (activo && turno === versionDetalle) { estado(error.message); el('pagosModalEstado').textContent = error.message; }
    }
  }
  el('pagosProductosCerrar').addEventListener('click', () => cerrarDetalle(true));
  el('pagosModalCerrar').addEventListener('click', () => cerrarDetalle(true));
  el('pagosProductos').addEventListener('click', event => { if (event.target === el('pagosProductos')) cerrarDetalle(true); });
  el('pagosProductos').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); cerrarDetalle(true); }
    if (event.key === 'Tab') {
      const controles = [...el('pagosProductos').querySelectorAll('button:not(:disabled), input:not([hidden]), select, a[href]')].filter(n=>n.getClientRects().length);
      const primero=controles[0],ultimo=controles.at(-1);
      if(event.shiftKey&&document.activeElement===primero){event.preventDefault();ultimo?.focus();}
      else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primero?.focus();}
    }
  });
  el('pagosGeneral').hidden = !modoGeneral;
  el('pagosSeleccion').hidden = true;
  el('pagosVolver').hidden = true;
  if (modoGeneral) await cargarGeneral(); else await cargarProveedores();
}
