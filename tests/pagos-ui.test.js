import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {once} from 'node:events';
import {centimos,estadoDemo} from '../public/js/modules/pagos.js';

test('prototipo de pagos: céntimos exactos y estados derivados',()=>{
  assert.equal(centimos('0.10'),10);assert.equal(centimos('1,50'),150);assert.equal(centimos('1500.00'),150000);
  for(const valor of ['',0,-1,'1.001','abc','1e3','Infinity','9007199254740992'])assert.equal(centimos(valor),null);
  assert.equal(estadoDemo({importe:null,abonos:[]}),'Sin cotización');
  assert.equal(estadoDemo({importe:30,abonos:[]}),'Pendiente');
  assert.equal(estadoDemo({importe:30,abonos:[{monto:10}]}),'Parcial');
  assert.equal(estadoDemo({importe:30,abonos:[{monto:10},{monto:20}]}),'Pagado');
});

test('navegador: pagos de demostración por proveedor y orden, sin enviar escrituras',{skip:!process.env.TEST_CHROME,timeout:45000},async()=>{
  const proveedores=[{id_proveedor:1,razon_social:'LALO'},{id_proveedor:2,razon_social:'Joselito'},{id_proveedor:3,razon_social:'LíderBook'}];
  const ordenes=[
    {id_solicitud:72,id_proveedor:2,proveedor:'Joselito',codigo:'OC-MAS-000072',colegios:3,total:48,estado:'Generada'},
    {id_solicitud:73,id_proveedor:2,proveedor:'Joselito',codigo:'SC-000073',colegios:1,total:20,estado:'Generada'},
    {id_solicitud:74,id_proveedor:1,proveedor:'LALO',codigo:'OC-MAS-000074',colegios:2,total:30,estado:'Generada'},
  ];
  const antes=JSON.stringify(ordenes),peticiones=[];
  const app=express();
  app.use('/api',(req,res,next)=>{peticiones.push({metodo:req.method,url:req.url});if(req.method!=='GET')return res.status(405).json({message:'No se permiten escrituras'});next();});
  app.get('/api/proveedores',(req,res)=>res.json({data:proveedores}));
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
      const elegir=async id=>{el('pagosProveedor').value=id;el('pagosProveedor').dispatchEvent(new Event('change'));await wait(()=>el('pagosOrdenesPanel').hidden===false);};
      const archivo=(nombre,tipo,contenido)=>{const dt=new DataTransfer();dt.items.add(new File([contenido],nombre,{type:tipo}));el('pagosArchivo').files=dt.files;el('pagosArchivo').dispatchEvent(new Event('change',{bubbles:true}));};
      const seleccionar=id=>el('pagosOrdenes').querySelector('[data-pago-orden="'+id+'"]').click();
      const enviar=id=>el(id).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      await wait(()=>el('pagosProveedor')&&!el('pagosProveedor').disabled);
      check(document.querySelector('[data-page="pagos"]').classList.contains('active'),'Pagos activo en SPA');
      check(el('pagosResumen').hidden&&el('pagos').textContent.includes('demostración'),'Aviso e inicio sin proveedor');
      await elegir('2');check(el('pagosOrdenes').querySelectorAll('[data-pago-orden]').length===2,'Cargar todas las páginas de Joselito');
      check(!el('pagosOrdenes').textContent.includes('000074'),'No mezclar proveedor');
      seleccionar('72');check(el('pagosCotizacionForm')&&!el('pagosAgregarAbono'),'Sin pagos antes de cotizacion');
      archivo('archivo.exe','application/octet-stream','no');check(el('err-pagosArchivo').textContent.includes('válido'),'Tipo de archivo inválido');
      archivo('grande.pdf','application/pdf',new Uint8Array(10*1024*1024+1));check(el('err-pagosArchivo').textContent.includes('10 MB'),'Limite de tamaño');
      const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0s8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
      archivo('cotizacion.png','image/png',png);
      await wait(()=>el('pagosArchivoVista').querySelector('img').complete);
      check(el('pagosArchivoVista').textContent.includes('cotizacion.png'),'Nombre y vista previa de imagen');
      el('pagosImporte').value='0';enviar('pagosCotizacionForm');check(el('err-pagosImporte').textContent,'Importe cero rechazado');
      el('pagosImporte').value='1500.00';const guardar=el('pagosCotizacionForm').querySelector('button');guardar.click();guardar.click();
      check(el('pagosDetalleEstado').textContent==='Pendiente'&&el('pagosTotalAcordado').textContent.includes('1,500.00'),'Cotizacion temporal y estado pendiente');
      check(el('pagosAbonoForm').hidden,'Abono oculto inicialmente');
      el('pagosAgregarAbono').click();el('pagosAbonoMonto').value='1600';el('pagosAbonoFecha').value='2026-10-26';el('pagosAbonoMetodo').value='Yape';enviar('pagosAbonoForm');
      check(el('err-pagosAbonoMonto').textContent.includes('saldo'),'Rechaza sobrepago');
      el('pagosAbonoMonto').value='-1';enviar('pagosAbonoForm');check(el('err-pagosAbonoMonto').textContent,'Monto negativo rechazado');
      el('pagosAbonoMonto').value='500';el('pagosAbonoReferencia').value='Prueba Yape';const abonar=el('pagosAbonoForm').querySelector('button');abonar.click();abonar.click();
      check(el('pagosDetalleEstado').textContent==='Parcial'&&document.querySelectorAll('.pagos-historial li').length===1,'Abono único frente a doble clic');
      check(el('pagosTotalAbonado').textContent.includes('500.00')&&el('pagosSaldoPendiente').textContent.includes('1,000.00'),'Saldos parciales correctos');
      await elegir('1');check(el('pagosTotalAcordado').textContent.includes('0.00'),'Totales exclusivos de LALO');
      seleccionar('74');check(el('pagosCotizacionForm')&&!el('pagosAgregarAbono'),'Otra orden sin cotizacion');
      await elegir('2');seleccionar('72');check(document.querySelectorAll('.pagos-historial li').length===1,'Conserva abono al cambiar proveedor');
      el('pagosAgregarAbono').click();el('pagosAbonoMonto').value='1000';el('pagosAbonoFecha').value='2026-10-26';el('pagosAbonoMetodo').value='Transferencia';enviar('pagosAbonoForm');
      check(el('pagosDetalleEstado').textContent==='Pagado'&&!el('pagosAgregarAbono')&&document.querySelectorAll('.pagos-historial li').length===2,'Pago completo e historial conservado');
      seleccionar('73');archivo('cotizacion.pdf','application/pdf','%PDF-1.4 prueba');
      check(el('pagosArchivoVista').querySelector('a').href.startsWith('blob:'),'Vista local de PDF');
      el('pagosImporte').value='200';enviar('pagosCotizacionForm');
      check(el('pagosTotalAcordado').textContent.includes('1,700.00')&&el('pagosTotalAbonado').textContent.includes('1,500.00')&&el('pagosSaldoPendiente').textContent.includes('200.00'),'Suma de importes acordados del proveedor');
      check(el('pagosDetalleTitulo').textContent.includes('SC-000073')&&el('pagosDetalleEstado').textContent==='Pendiente','Cotizacion asociada a su ID masivo, incluido historico');
      const url=el('pagosDetalleContenido').querySelector('a').href;
      location.hash='#/dashboard';await wait(()=>el('dashboard-title'));
      let revocado=false;try{await fetch(url);}catch{revocado=true;}check(revocado,'Libera archivos al salir');
      location.hash='#/pagos';await wait(()=>el('pagosProveedor')&&!el('pagosProveedor').disabled);
      await elegir('2');seleccionar('72');check(el('pagosCotizacionForm')&&el('pagosTotalAcordado').textContent.includes('0.00'),'Reinicia simulaciones al volver');
      await elegir('3');check(el('pagosOrdenes').textContent.includes('no tiene órdenes')&&el('pagosDetalle').hidden,'Proveedor sin órdenes');
      await elegir('2');seleccionar('72');return true;
    })()`});
    assert.equal(resultado.result?.exceptionDetails,undefined,JSON.stringify(resultado.result?.exceptionDetails));
    assert.equal(resultado.result?.result?.value,true);
    assert.ok(peticiones.length>0&&peticiones.every(p=>p.metodo==='GET'),'El prototipo solo consulta');
    assert.ok(peticiones.some(p=>p.url.includes('pagina=2')),'Respeta paginación del endpoint existente');
    assert.equal(JSON.stringify(ordenes),antes,'No modifica los datos de órdenes reales');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const movil=await call('Runtime.evaluate',{returnByValue:true,expression:'document.documentElement.scrollWidth<=window.innerWidth'});
    assert.equal(movil.result?.result?.value,true,'Sin desbordamiento horizontal en móvil');
  }finally{
    socket?.close();browser.kill();server.closeAllConnections();await new Promise(r=>server.close(r));
    await new Promise(r=>setTimeout(r,500));
    assert.ok(profile.startsWith(resolve(tmpdir())+sep+'ishume-pagos-ui-'),'Perfil temporal dentro del directorio previsto');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
