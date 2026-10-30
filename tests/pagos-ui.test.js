import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {once} from 'node:events';
import {centimos,validarArchivo} from '../public/js/modules/pagos.js';
import {validarContenidoArchivo} from '../src/services/archivoPagoService.js';

test('pagos: céntimos exactos, adelanto cero y límites de archivo',()=>{
  assert.equal(centimos('0.10'),10);assert.equal(centimos('1,50'),150);assert.equal(centimos('1500.00'),150000);
  for(const valor of ['',0,-1,'1.001','abc','1e3','Infinity','9007199254740992'])assert.equal(centimos(valor),null);
  assert.equal(centimos('0',true),0);assert.equal(centimos('-1',true),null);
  assert.equal(centimos('9999999999.99'),999999999999);
  assert.equal(centimos('10000000000'),null);
  assert.equal(validarArchivo({name:'cotizacion.pdf',type:'application/pdf',size:10485760}),'');
  assert.ok(validarArchivo({name:'cotizacion.pdf',type:'application/pdf',size:10485761}));
  assert.ok(validarArchivo({name:'cotizacion.exe',type:'application/pdf',size:100}));
});

test('navegador: pagos rediseñados, órdenes reales y guardado pendiente sin escrituras',{skip:!process.env.TEST_CHROME,timeout:45000},async()=>{
  const proveedores=[{id_proveedor:1,razon_social:'LALO'},{id_proveedor:2,razon_social:'Joselito'},{id_proveedor:3,razon_social:'LíderBook'}];
  const ordenes=[
    {id_solicitud:72,id_proveedor:2,proveedor:'Joselito',codigo:'OC-MAS-000072',colegios:3,total:48,estado:'Generada'},
    {id_solicitud:73,id_proveedor:2,proveedor:'Joselito',codigo:'SC-000073',colegios:1,total:20,estado:'Generada'},
    {id_solicitud:74,id_proveedor:1,proveedor:'LALO',codigo:'OC-MAS-000074',colegios:2,total:30,estado:'Generada'},
    {id_solicitud:75,id_proveedor:2,proveedor:'Joselito',codigo:'OC-JOS-0075',colegios:1,total:5,estado:'Generada'},
  ];
  const antes=JSON.stringify(ordenes),peticiones=[];
  let habilitado=false,documentosEnviados=0,abonosEnviados=0,archivoSubido=null;
  const economias=new Map();
  const economia=id=>economias.get(id)||{id_solicitud:id,habilitado,documento:null,historial:[],importe:null,abonado:null,saldo:null};
  const app=express();
  app.use('/api',(req,res,next)=>{peticiones.push({metodo:req.method,url:req.url});if(req.method!=='GET'&&!habilitado)return res.status(405).json({message:'No se permiten escrituras'});next();});
  app.get('/api/proveedores',(req,res)=>res.json({data:proveedores}));
  app.get('/api/pagos/ordenes/:id',(req,res)=>res.json({data:economia(Number(req.params.id))}));
  app.get('/api/documento-prueba',(req,res)=>res.type('image/jpeg').send(archivoSubido));
  app.post('/api/pagos/ordenes/:id/documento',express.raw({type:'application/octet-stream'}),(req,res)=>{
    documentosEnviados++;const id=Number(req.params.id),p=JSON.parse(decodeURIComponent(req.get('X-Pagos-Datos')));
    validarContenidoArchivo(req.body,decodeURIComponent(req.get('X-Pagos-Nombre')),req.get('X-Pagos-Mime'));archivoSubido=req.body;
    const total=Number(p.importe),pagado=Number(p.adelanto);
    const data={id_solicitud:id,habilitado:true,documento:{version:1,nombre:'foto.jpg',mime:'image/jpeg',url:'/api/documento-prueba',fecha:p.fecha_documento},importe:total.toFixed(2),abonado:pagado.toFixed(2),saldo:(total-pagado).toFixed(2),porcentaje:pagado/total*100,estado_economico:'Parcial',historial:[{fecha_pago:p.fecha_pago,metodo_pago:p.metodo_pago,monto:pagado.toFixed(2),numero_operacion:null,motivo_anulacion:null}]};economias.set(id,data);res.json({data});
  });
  app.post('/api/pagos/ordenes/:id/abonos',express.json(),(req,res)=>{
    abonosEnviados++;const data=economia(Number(req.params.id)),p=req.body;
    data.historial.push({...p,monto:p.monto,motivo_anulacion:null});data.abonado=(Number(data.abonado)+Number(p.monto)).toFixed(2);data.saldo=(Number(data.importe)-Number(data.abonado)).toFixed(2);data.porcentaje=Number(data.abonado)/Number(data.importe)*100;data.estado_economico=data.saldo==='0.00'?'Pagado':'Parcial';res.json({data});
  });
  app.get('/api/pagos/ordenes',(req,res)=>{
    const normalizar=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const filtro=normalizar(String(req.query.q||'')),pagina=Number(req.query.pagina||1);
    const filas=ordenes.filter(o=>/^(?:OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$/.test(o.codigo)&&normalizar(o.proveedor+' '+o.codigo).includes(filtro));
    res.json({data:{ordenes:filas.slice(pagina-1,pagina).map(o=>({...o,...(economias.has(o.id_solicitud)?economia(o.id_solicitud):{})})),pagina,hayMas:pagina<filas.length,economia_disponible:habilitado}});
  });
  let detalleFalla=true;
  app.get('/api/compras-masivas/solicitudes/:id',(req,res)=>{
    if(detalleFalla){detalleFalla=false;return res.status(503).json({message:'No se pudo consultar el detalle. Reintenta.'});}
    const orden=ordenes.find(o=>o.id_solicitud===Number(req.params.id));
    if(!orden)return res.status(404).json({message:'Orden de compra no encontrada.'});
    res.json({data:{...orden,distribuciones:[{id_contrato:1,id_producto:1,colegio:'Colegio completo de prueba',modelo:'Modelo real de la orden',cantidad:orden.total}]}});
  });
  app.get('/api/compras-masivas/solicitudes',(req,res)=>{
    const filtro=String(req.query.q||'').toLowerCase(),pagina=Number(req.query.pagina||1);
    const coincidencias=ordenes.filter(o=>o.proveedor.toLowerCase().includes(filtro));
    // Una orden por página obliga a comprobar que se cargue todo el proveedor.
    res.json({data:{pagina,hayMas:pagina<coincidencias.length,solicitudes:coincidencias.slice(pagina-1,pagina)}});
  });
  const index=(await readFile(resolve('public/index.html'),'utf8')).replace(/<link[^>]*https:[^>]*>/g,'');
  app.get('/',(req,res)=>res.type('html').send(index));app.use(express.static(resolve('public')));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const profile=await mkdtemp(join(tmpdir(),'ishume-pagos-ui-'));
  const browser=spawn(process.env.TEST_CHROME,['--headless','--disable-gpu','--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  try{
    let port;
    for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
    assert.ok(port);
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
    socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,'open');
    let secuencia=0;const pendientes=new Map();
    socket.addEventListener('message',event=>{const mensaje=JSON.parse(event.data);pendientes.get(mensaje.id)?.(mensaje);pendientes.delete(mensaje.id);});
    const call=(method,params={})=>new Promise((done,reject)=>{const id=++secuencia;const limite=setTimeout(()=>reject(Error('CDP sin respuesta: '+method)),15000);pendientes.set(id,res=>{clearTimeout(limite);done(res);});socket.send(JSON.stringify({id,method,params}));});
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/#/pagos`});await call('Runtime.enable');
    const resultado=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const el=id=>document.getElementById(id),check=(valor,mensaje)=>{if(!valor)throw Error(mensaje);};
      const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Espera agotada');};
      const archivo=(nombre,tipo,contenido)=>{const dt=new DataTransfer();dt.items.add(new File([contenido],nombre,{type:tipo}));el('pagosArchivo').files=dt.files;el('pagosArchivo').dispatchEvent(new Event('change',{bubbles:true}));};
      const importe=(id,valor)=>{el(id).value=valor;el(id).dispatchEvent(new Event('input'));};
      const abrir=async id=>{location.hash='#/pagos?orden='+id;await wait(()=>el('pagosProductos')?.classList.contains('open')&&!el('pagosDetalle').hidden);};
      await wait(()=>el('pagosResultados')?.querySelector('a'));
      check(el('pagosResultados').querySelectorAll('table').length===1&&[...el('pagosResultados').querySelectorAll('thead th')].map(n=>n.textContent).join(',')==='Orden / Proveedor,Total,Abonado,Saldo,Acciones','Tabla general unica con cinco columnas');
      check(!el('pagosFiltro')&&!el('pagosFiltrosAyuda')&&!el('pagos').querySelector('.page-subtitle')&&!el('topbarTitle').textContent&&el('pagosBusqueda').placeholder==='Buscar proveedor o código...','Encabezado y buscador sin textos ni filtros redundantes');
      check(!el('pagosResultados').querySelector('.pagos-grupo'),'Sin tarjetas por proveedor');
      check(document.querySelector('[data-page="pagos"]').classList.contains('active')&&el('ordenesMenu').open,'Sidebar activo');
      el('pagosSiguiente').click();await wait(()=>el('pagosResultados').textContent.includes('OC-MAS-000074'));
      el('pagosBusqueda').value='  JÓS  ';el('pagosBusqueda').dispatchEvent(new Event('input'));
      await wait(()=>el('pagosResultados').textContent.includes('OC-MAS-000072')&&el('pagosPaginacion').hidden);
      check(!el('pagosResultados').textContent.includes('OC-MAS-000074'),'Busqueda parcial sin tildes ni espacios');
      el('pagosBusqueda').value='inexistente';el('pagosBusqueda').dispatchEvent(new Event('input'));
      await wait(()=>el('pagosEstado').textContent==='No se encontraron órdenes');
      el('pagosBusqueda').value='';el('pagosBusqueda').dispatchEvent(new Event('input'));
      await wait(()=>el('pagosResultados').querySelector('a'));
      el('pagosResultados').querySelector('a').click();
      await wait(()=>el('pagosEstado')?.textContent.includes('Reintenta.'));
      el('pagosReintentar').click();await wait(()=>el('pagosProductos')?.classList.contains('open')&&!el('pagosDetalle').hidden);
      check(el('pagosProductosTitulo').textContent==='OC-MAS-000072','Encabezado muestra solo el código real');
      check(!el('pagosTipoDocumento')&&!el('pagosNumeroDocumento')&&!el('pagosSaldo')&&!el('pagosProductos').querySelector('.pagos-economia')&&!el('pagosProductosContenido'),'Sin secciones ni campos adicionales');
      check([...el('pagosCotizacionForm').querySelectorAll('input:not([type="file"])')].filter(n=>n.getClientRects().length).map(n=>n.id).join(',')==='pagosFechaCotizacion,pagosImporte,pagosAdelanto','Solo fecha del documento, importe y adelanto iniciales');
      check(el('pagosGuardar').disabled&&el('pagosSeguimiento').hidden,'Sin persistencia ni progreso ficticios');
      archivo('mal.exe','application/pdf','mal');check(el('err-pagosArchivo').textContent.includes('válido'),'Validar formato');
      archivo('grande.pdf','application/pdf',new Uint8Array(10*1024*1024+1));check(el('err-pagosArchivo').textContent.includes('10 MB'),'Validar limite');
      const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
      archivo('documento.png','image/png',bytes);await wait(()=>el('pagosArchivoVista').querySelector('img')?.complete);
      check(el('pagosArchivoVista').querySelector('img').getBoundingClientRect().height<=80&&el('pagosArchivoVista').querySelector('a').textContent==='Ampliar imagen','Miniatura y ampliacion');
      const url=el('pagosArchivoVista').querySelector('img').src;
      importe('pagosImporte','1500');importe('pagosAdelanto','500');
      check(!el('err-pagosImporte').textContent&&!el('err-pagosAdelanto').textContent,'Importe y adelanto válidos sin segundo resumen');
      importe('pagosAdelanto','1600');check(el('err-pagosAdelanto').textContent,'Rechaza adelanto excesivo');
      importe('pagosAdelanto','0');check(!el('err-pagosAdelanto').textContent,'Adelanto cero válido');
      el('pagosCotizacionForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      check(el('pagosGuardar').disabled&&el('pagosModalEstado').textContent.includes('Falta preparar'),'No simula un guardado');
      el('pagosModalCerrar').click();await wait(()=>el('pagosResultados')?.querySelector('a'));
      let revocado=false;try{await fetch(url);}catch{revocado=true;}check(revocado,'Cerrar libera archivo local');
      await abrir('74');check(el('pagosProductosTitulo').textContent==='OC-MAS-000074'&&el('pagosImporte').value==='','No mezclar documentos entre ordenes');
      archivo('nota.pdf','application/pdf','%PDF-1.4');
      check(el('pagosArchivoVista').querySelector('a').href.startsWith('blob:'),'PDF local consultable');
      el('pagosProductos').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      await wait(()=>el('pagosResultados')?.querySelector('a'));
      location.hash='#/ordenes/guardadas';await wait(()=>el('tabRealizados')&&!el('tabRealizados').disabled&&el('ordenesBuscador').getAttribute('aria-busy')==='false');
      el('tabRealizados').click();await wait(()=>document.querySelector('a[href="#/pagos?orden=72"]'));
      document.querySelector('a[href="#/pagos?orden=72"]').click();
      await wait(()=>el('pagosProductos')?.classList.contains('open')&&!el('pagosDetalle').hidden);
      check(el('pagosProductosTitulo').textContent.includes('OC-MAS-000072'),'Gestionar abre el mismo modal y orden');
      el('pagosProductosCerrar').click();await wait(()=>el('pagosResultados')?.querySelector('a'));
      location.hash='#/pagos?orden=999';await wait(()=>el('pagosEstado')?.textContent.includes('no encontrada'));
      check(el('pagosProductos').hidden,'No abre un documento inexistente');
      location.hash='#/pagos?orden=0';await wait(()=>el('pagosEstado')?.textContent.includes('no es válido'));
      location.hash='#/pagos?orden=73';await wait(()=>el('pagosEstado')?.textContent.includes('no corresponde'));
      await abrir('72');
      return true;

    })()`});
    assert.equal(resultado.result?.exceptionDetails,undefined,JSON.stringify(resultado.result?.exceptionDetails));
    assert.equal(resultado.result?.result?.value,true);
    assert.ok(peticiones.length>0&&peticiones.every(p=>p.metodo==='GET'),'El prototipo solo consulta');
    assert.ok(peticiones.some(p=>p.url.includes('pagina=2')),'Respeta paginación del endpoint existente');
    assert.equal(JSON.stringify(ordenes),antes,'No modifica los datos de órdenes reales');
    await call('Page.reload');await new Promise(r=>setTimeout(r,300));
    const recarga=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{for(let i=0;i<150;i++){if(document.getElementById('pagosOrden')?.value==='72'&&!document.getElementById('pagosDetalle').hidden)return true;await new Promise(r=>setTimeout(r,25));}return false;})()`});
    assert.equal(recarga.result?.result?.value,true,'Recargar conserva la orden contextual');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const movil=await call('Runtime.evaluate',{returnByValue:true,expression:'document.documentElement.scrollWidth<=window.innerWidth'});
    assert.equal(movil.result?.result?.value,true,'Sin desbordamiento horizontal en móvil');
    const generalMovil=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{document.getElementById('pagosModalCerrar').click();for(let i=0;i<150;i++){if(document.getElementById('pagosResultados')?.querySelector('a'))return !document.getElementById('pagosGeneral').hidden&&document.documentElement.scrollWidth<=innerWidth;await new Promise(r=>setTimeout(r,25));}return false;})()`});
    assert.equal(generalMovil.result?.result?.value,true,'Volver a vista general responsive');
    // Backend HTTP simulado para comprobar el frontend habilitado; las transacciones
    // y archivos privados se verifican por separado en pagos-backend.test.js.
    habilitado=true;ordenes[0].codigo='ORDEN-MAS-JOS-001';
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/#/pagos?orden=72`});
    const financiero=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const el=id=>document.getElementById(id),wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,30));}throw Error('Espera financiera agotada');},check=(x,m)=>{if(!x)throw Error(m);};
      await wait(()=>el('pagosGuardar')&&!el('pagosGuardar').disabled&&!el('pagosDetalle').hidden);
      check(el('pagosProductosTitulo').textContent==='ORDEN-MAS-JOS-001','Admite código definitivo');
      const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);
      const jpg=await(await fetch(canvas.toDataURL('image/jpeg'))).blob();const dt=new DataTransfer();dt.items.add(new File([jpg],'foto.jpg',{type:'image/jpeg'}));el('pagosArchivo').files=dt.files;el('pagosArchivo').dispatchEvent(new Event('change',{bubbles:true}));
      el('pagosImporte').value='1500';el('pagosImporte').dispatchEvent(new Event('input'));el('pagosAdelanto').value='200';el('pagosAdelanto').dispatchEvent(new Event('input'));
      check(!el('pagosDatosAdelanto').hidden,'Adelanto positivo solicita fecha y método');
      el('pagosFechaAdelanto').value='2026-10-30';el('pagosMetodoAdelanto').value='Transferencia';el('pagosFechaCotizacion').value='2026-10-30';el('pagosGuardar').click();el('pagosGuardar').click();
      await wait(()=>!el('pagosSeguimiento').hidden&&!el('pagosModalCerrar').disabled&&el('pagosSaldoReal').textContent.includes('1,300.00'));
      check(el('pagosCotizacionForm').hidden&&el('pagosAbonadoReal').textContent.includes('200.00'),'Muestra seguimiento sin duplicar adelanto');
      el('pagosModalCerrar').click();await wait(()=>el('pagosResultados')?.textContent.includes('1,300.00'));
      el('pagosResultados').querySelector('a').click();await wait(()=>el('pagosSeguimiento')&&!el('pagosSeguimiento').hidden);
      check(el('pagosArchivoGuardado').querySelector('a'),'Recupera documento del servidor');
      const pagar=async monto=>{el('pagosNuevoAbono').click();el('pagosAbonoMonto').value=monto;el('pagosAbonoFecha').value='2026-10-30';el('pagosAbonoMetodo').value='Yape';el('pagosAbonoOperacion').value='OP-002';el('pagosAbonoForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));el('pagosAbonoForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!el('pagosSeguimiento').hidden&&!el('pagosModalCerrar').disabled);};
      await pagar('300');check(el('pagosSaldoReal').textContent.includes('1,000.00'),'Abono actualiza saldo');
      el('pagosVerHistorial').click();check(el('pagosHistorial').querySelectorAll('tbody tr').length===2,'Historial conserva adelanto y abono');el('pagosSeguimientoVolver').click();
      await pagar('1000');check(el('pagosNuevoAbono').disabled&&el('pagosEstadoReal').textContent==='Pagado','Saldo cero bloquea nuevos abonos');
      return true;
    })()`});
    assert.equal(financiero.result?.exceptionDetails,undefined,JSON.stringify(financiero.result?.exceptionDetails));
    assert.equal(financiero.result?.result?.value,true);
    assert.equal(documentosEnviados,1,'Doble clic no repite subida');assert.equal(abonosEnviados,2,'Un envío por cada abono');
  }finally{
    socket?.close();browser.kill();server.closeAllConnections();await new Promise(r=>server.close(r));
    await new Promise(r=>setTimeout(r,500));
    assert.ok(profile.startsWith(resolve(tmpdir())+sep+'ishume-pagos-ui-'),'Perfil temporal dentro del directorio previsto');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
