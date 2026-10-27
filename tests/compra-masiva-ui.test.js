import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

test('navegador: nueva orden, revisión, guardado y navegación a órdenes guardadas', { skip: !process.env.TEST_CHROME, timeout: 40000 }, async () => {
  const app = express();
  app.use(express.json());
  let confirmaciones = 0;
  let intentosConfirmar = 0;
  let cargasListado = 0;
  let descargas = 0;
  let solicitudesGeneradas=0;
  let solicitudGuardada=false;
  const consultasPendientes=[];
  const solicitudData={id_solicitud:1,id_proveedor:1,codigo:'OC-MAS-000001',proveedor:'Proveedor de prueba',total:30,modelos:1,estado:'Generada',fecha:'23/10/2026',
    ordenes:[{id_orden:1,codigo:'OC-PRU-0001'},{id_orden:2,codigo:'OC-PRU-0002'}],
    productos:[{modelo:'Modelo guardado',categoria:'Cuadro',cantidad:30}],
    distribuciones:[{id_contrato:1,id_contrato_api:8,colegio:'Colegio guardado',modelo:'Modelo guardado',categoria:'Cuadro',cantidad:10},{id_contrato:2,id_contrato_api:25,colegio:'Segundo colegio',modelo:'Modelo guardado',categoria:'Cuadro',cantidad:20}]};
  const historicas=[
    {...solicitudData,id_solicitud:2,codigo:'SC-000007',total:7,fecha:'01/10/2026',productos:[{modelo:'Modelo historico',cantidad:7}],distribuciones:[{id_contrato:3,colegio:'Colegio historico',modelo:'Modelo historico',cantidad:7}]},
    {...solicitudData,id_solicitud:3,id_proveedor:2,codigo:'OC-MAS-000003',proveedor:'Segundo proveedor',total:11,distribuciones:[{id_contrato:4,colegio:'Colegio otro proveedor',modelo:'Modelo distinto',cantidad:11}]},
    {...solicitudData,id_solicitud:4,id_proveedor:2,codigo:'SC-000009',proveedor:'Segundo proveedor',total:9,distribuciones:[{id_contrato:5,colegio:'Colegio segunda pagina',modelo:'Modelo paginado',cantidad:9}]}
  ];
  app.get('/api/compras-masivas/pendientes',(req,res)=>{
    consultasPendientes.push(req.query.q || '');
    const ordenes=[{id_orden:1,codigo:'OC-PRU-0001',fecha:'21/10/2026',total:10,colegios:[1]},{id_orden:2,codigo:'OC-PRU-0002',fecha:'22/10/2026',total:20,colegios:[2]},{id_orden:3,codigo:'OC-PRU-0003',fecha:'23/10/2026',total:5,colegios:[1]}].filter(o=>(!solicitudGuardada||o.id_orden===3)&&(!req.query.q||o.codigo.toLowerCase().includes(req.query.q.toLowerCase())||'proveedor de prueba'.includes(req.query.q.toLowerCase())));
    res.json({data:{pagina:1,hayMas:false,proveedores:[{id_proveedor:1,razon_social:'Proveedor de prueba',total:ordenes.reduce((s,o)=>s+o.total,0),colegios:solicitudGuardada?1:2,ordenes}]}});
  });
  app.get('/api/compras-masivas/pendientes/:id/detalle',(req,res)=>{
    assert.equal(req.params.id,'1');res.json({data:{...solicitudData,total:10,ordenes:[solicitudData.ordenes[0]],productos:[{modelo:'Modelo guardado',cantidad:10}],distribuciones:[{...solicitudData.distribuciones[0],cantidad:10}]}});
  });
  app.get('/api/compras-masivas/pendientes/proveedor/:id/detalle',(req,res)=>{
    assert.equal(req.params.id,'1');assert.equal(Object.keys(req.query).length,0);
    if(solicitudGuardada)return res.json({data:{...solicitudData,total:5,ordenes:[{id_orden:3,codigo:'OC-PRU-0003'}],distribuciones:[{...solicitudData.distribuciones[0],cantidad:5}]}});
    res.json({data:{...solicitudData,total:35,ordenes:[...solicitudData.ordenes,{id_orden:3,codigo:'OC-PRU-0003'}],distribuciones:[{...solicitudData.distribuciones[0],cantidad:15},solicitudData.distribuciones[1]]}});
  });
  app.post('/api/compras-masivas/solicitudes/revisar',(req,res)=>{assert.deepEqual(req.body.ordenes,[1,2]);res.json({data:{...solicitudData,huella:'a'.repeat(64)}});});
  app.post('/api/compras-masivas/solicitudes/confirmar',(req,res)=>{solicitudesGeneradas++;solicitudGuardada=true;setTimeout(()=>res.json({data:solicitudData}),100);});
  app.get('/api/compras-masivas/solicitudes',(req,res)=>{
    const q=String(req.query.q||'').toLowerCase();
    const filtradas=solicitudGuardada?[solicitudData,...historicas].filter(o=>o.codigo.toLowerCase().includes(q)||o.proveedor.toLowerCase().includes(q)):[];
    const pagina=Number(req.query.pagina||1);
    res.json({data:{pagina,hayMas:pagina===1&&filtradas.length>3,solicitudes:filtradas.slice((pagina-1)*3,pagina*3)}});
  });
  app.get('/api/compras-masivas/solicitudes/:id/pdf',(req,res)=>{descargas++;res.attachment('Orden-prueba.pdf').type('application/pdf').send(Buffer.from('%PDF-1.4\nPrueba consolidada'));});
  app.get('/api/compras-masivas/solicitudes/:id',(req,res)=>res.json({data:[solicitudData,...historicas].find(o=>o.id_solicitud===Number(req.params.id))}));
  app.get('/api/compras-masivas/ordenes/:id/pdf', (req, res) => {
    if (req.params.id !== '1') return res.status(404).json({ message: 'Orden de compra no encontrada.' });
    descargas++;
    res.attachment('OC-PRUEBA.pdf').type('application/pdf').send(Buffer.from('%PDF-1.4\nPrueba de descarga'));
  });
  app.get('/api/proveedores', (req, res) => res.json({ data: [{ id_proveedor: 1, razon_social: 'Proveedor de prueba' }, {id_proveedor:2,razon_social:'Otro proveedor'}] }));
  app.get('/api/contratos/colegios', (req,res) => { cargasListado++; if(cargasListado===1)return res.status(502).json({message:'Listado temporalmente no disponible'});res.json({data:[8,25,404,94,95].map(id=>({id_contrato:id,colegio:id===94?'22230 Inicial':id===95?'Colegio actualizado sin modelos':id===404?'Colegio error':'Santo Domingo Tecnológico Niño',cliente:'Responsable '+id,fecha_entrega:'2026-12-20',modelos_disponibles:id!==94,aviso_modelos:id===94?'Sin modelos disponibles':''}))}); });
  app.get('/api/contratos', (req, res) => {
    if(req.query.id==='404')return res.status(404).json({message:'Contrato no encontrado'});
    return res.json({ data: {
    id_contrato: Number(req.query.id), colegio:'Santo Domingo Tecnol\u00f3gico Ni\u00f1o', estado_trabajo:'en_proceso', promocion:'Promoci\u00f3n', cliente: `Cliente - Colegio ${req.query.id}${req.query.id==='8'?' - BENEFICIO INICIAL AVENIDA MELCHORITA 486 GROCIO':''}`, fecha_entrega: '2026-12-20',
    productos: req.query.id==='95'?[]:[{ id_modelo: 1, modelo: 'Modelo compartido', categoria: 'Cuadro', cantidad: 30 }, { id_modelo: 2, modelo: 'Anuario A', categoria: 'Anuario', cantidad: 2 }],
  } });});
  app.post('/api/compras-masivas/revisar', (req, res) => {
    const grupos = new Map();
    for(const c of req.body.contratos)for(const p of c.productos){
      if(!grupos.has(p.id_proveedor))grupos.set(p.id_proveedor,{razon_social:p.id_proveedor===1?'Proveedor de prueba':'Otro proveedor',productos:[]});
      const grupo=grupos.get(p.id_proveedor);
      let producto=grupo.productos.find(v=>v.id_modelo===p.id_modelo);
      if(!producto){producto={id_modelo:p.id_modelo,modelo:p.id_modelo===1?'Modelo compartido':'Anuario A',categoria:p.id_modelo===1?'Cuadro':'Anuario',cantidad:0,distribuciones:[]};grupo.productos.push(producto);}
      producto.cantidad+=p.cantidad;
      producto.distribuciones.push({colegio:'Santo Domingo Tecnol\u00f3gico Ni\u00f1o',id_contrato:c.id_contrato,cantidad:p.cantidad});
    }
    res.json({data:{token:'revision',ordenes:[...grupos.values()]}});
  });
  app.post('/api/compras-masivas/confirmar', (req, res) => {
    intentosConfirmar++;
    if (intentosConfirmar === 1) return setTimeout(()=>res.status(503).json({message:'Error temporal de prueba'}),100);
    confirmaciones++;
    setTimeout(() => res.json({ data: { ordenes: [{ codigo: 'OC-PRU-0001', id_orden: 1, id_proveedor: 1, proveedor: 'Proveedor de prueba', total: 69, modelos: 2, estado: 'Borrador' }] } }), 100);
  });
  app.get('/api/compras-masivas/ordenes/:id', (req,res) => {
    if(req.params.id!=='1')return res.status(404).json({message:'Orden de compra no encontrada.'});
    res.json({data:{id_orden:1,codigo:'OC-PRU-0001',proveedor:'Proveedor de prueba',total:69,modelos:2,estado:'Borrador',fecha:'22/10/2026',productos:[{modelo:'Modelo guardado',categoria:'Cuadro',cantidad:69}],distribuciones:[{id_contrato:1,id_contrato_api:8,colegio:'Colegio guardado',modelo:'Modelo guardado',categoria:'Cuadro',cantidad:69}]}});
  });
  app.get('/api/compras-masivas/ordenes',(req,res)=>res.json({data:{pagina:1,hayMas:false,ordenes:req.query.q==='inexistente'?[]:[{id_orden:1,codigo:'OC-PRU-0001',proveedor:'Proveedor de prueba',total:69,modelos:2,estado:'Borrador'}]}}));
  const index = (await readFile(resolve('public/index.html'), 'utf8')).replace(/<link[^>]*https:[^>]*>/g, '');
  app.get('/', (req, res) => res.type('html').send(index));
  app.use(express.static(resolve('public')));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const profile = await mkdtemp(join(tmpdir(), 'ishume-ui-'));
  const browser = spawn(process.env.TEST_CHROME, ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(port, 'Chrome debe iniciar');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP sin respuesta: ${method}`)), 15000);
      const id = ++sequence; pending.set(id, (value) => { clearTimeout(timer); resolve(value); }); socket.send(JSON.stringify({ id, method, params }));
    });
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/#/contratos` });
    await call('Page.bringToFront');
    await call('Runtime.enable');
    await new Promise((r) => setTimeout(r, 500));
    const outcome = await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const wait = async (f) => { for(let i=0;i<150;i++){if(f()) return;await new Promise(r=>setTimeout(r,50));} throw Error('Espera agotada'); };
      const el=id=>document.getElementById(id);
      const check=(v,m)=>{if(!v) throw Error(m)};
      await wait(()=>el('colegioReintentar')&&!el('colegioReintentar').hidden&&!el('colegioBusqueda').disabled); el('colegioReintentar').click(); await wait(()=>!el('colegioBusqueda').disabled&&el('colegioReintentar').hidden);
      check(!el('contratoForm').hidden&&el('colegioResultados').hidden&&!document.querySelector('[data-colegio]'),'Buscador visible sin listado inicial');check(el('contratoForm').compareDocumentPosition(el('contratoColegios'))&Node.DOCUMENT_POSITION_FOLLOWING,'Buscador antes de colegios');check(!el('colegioAgregar'),'Sin boton redundante');
      check(!el('compraResumen').querySelector('.resumen-indicador'),'Accion inferior sin tarjetas repetidas');
      check(el('contratos-title').textContent==='Preparar pedidos','Nombre de la pantalla');
      check(window.location.hash==='#/ordenes/nueva'&&!el('ordenesBuscador'),'Ruta compatible sin órdenes guardadas debajo');
      check(el('ordenesMenu').open,'Submenú abierto en ruta activa');
      const menu=el('ordenesMenu');menu.querySelector('summary').click();check(!menu.open,'Cerrar desplegable');menu.querySelector('summary').click();check(menu.open,'Abrir desplegable');
      const agregar=async(id,n)=>{check(!el('contratoForm').hidden,'Mostrar buscador');el('colegioBusqueda').value=id==='404'?'error':'santo';el('colegioBusqueda').dispatchEvent(new Event('input'));await wait(()=>document.querySelector('[data-colegio="'+id+'"]'));document.querySelector('[data-colegio="'+id+'"]').click();await wait(()=>document.querySelectorAll('[data-contrato]').length===n&&!el('colegioBusqueda').disabled);check(!el('contratoForm').hidden&&el('colegioResultados').hidden&&el('colegioBusqueda').value==='','Buscador limpio y cerrado tras agregar');};
      for(const texto of ['SANTO','tecnologico','nino']){el('colegioBusqueda').value=texto;el('colegioBusqueda').dispatchEvent(new Event('input'));check(document.querySelectorAll('[data-colegio]').length===2,'Busqueda sin mayusculas ni tildes');}
      el('contratoColegios').dispatchEvent(new Event('pointerdown',{bubbles:true}));check(el('colegioResultados').hidden,'Cerrar lista al pulsar fuera del buscador');
      el('colegioBusqueda').value='inexistente';el('colegioBusqueda').dispatchEvent(new Event('input'));check(el('colegioBusquedaEstado').textContent==='No se encontraron colegios','Sin coincidencias');
      el('colegioBusqueda').value='22230';el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(document.querySelector('[data-colegio="94"]').disabled&&el('colegioResultados').textContent.includes('Sin modelos disponibles'),'Contrato real sin modelos se muestra deshabilitado');
      document.querySelector('[data-colegio="94"]').click();check(!document.querySelector('[data-contrato="94"]'),'No agrega contratos sin modelos');
      await agregar('8',1); await agregar('25',2);
      check(el('colegios-agregados-title').textContent==='Colegios agregados (2)','Contador de colegios actualizado');
      check([...document.querySelectorAll('[data-contrato="8"] > h3')].map(n=>n.textContent).join(',')==='Cuadros,Book','Categorias separadas sin combinar productos');
      check(document.querySelector('[data-contrato="8"] h2').textContent==='Santo Domingo Tecnol\u00f3gico Ni\u00f1o','Nombre real de colegio sin sustituir por cliente');
      el('colegioBusqueda').value='santo';el('colegioBusqueda').dispatchEvent(new Event('input'));check(document.querySelector('[data-colegio="8"]').disabled,'Evitar duplicado por contrato');
      check([...document.querySelectorAll('[data-numero]')].map(n=>n.textContent).join(',')==='Colegio 1,Colegio 2','Numeracion consecutiva');
      el('colegioBusqueda').value='actualizado';el('colegioBusqueda').dispatchEvent(new Event('input'));
      document.querySelector('[data-colegio="95"]').click();
      await wait(()=>el('contratoEstado').textContent.includes('Sin modelos disponibles'));
      el('colegioBusqueda').focus();el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(document.querySelectorAll('[data-contrato]').length===2&&document.querySelector('[data-colegio="95"]').disabled,'Consulta individual sin modelos conserva colegios y actualiza disponibilidad');
      el('colegioBusqueda').value='error';el('colegioBusqueda').dispatchEvent(new Event('input'));document.querySelector('[data-colegio="404"]').click();await wait(()=>el('contratoEstado').textContent.includes('Contrato no encontrado'));
      check(document.querySelectorAll('[data-contrato]').length===2&&!el('colegioBusqueda').disabled&&!el('colegioBusqueda').disabled,'Recuperar controles sin perder colegios');
      const quantity=document.querySelector('[data-cantidad]');quantity.value='35';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      el('compraPreparar').click();check(el('compraRevision').hidden,'Bloquear proveedor faltante');
      check(el('compraAccionResumen').textContent.includes('0 de 4')&&el('compraAccionResumen').textContent.includes('69'),'Accion compacta con modelos pendientes y unidades');
      document.querySelectorAll('[data-proveedor]').forEach(s=>{s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));});
      const proveedorControl=document.querySelector('[data-proveedor]');
      proveedorControl.value='2';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      const unidadesResumen=()=>Number(el('compraAccionResumen').textContent.match(/([0-9]+) unidades/)[1]);
      check(unidadesResumen()===69,'Reasignar proveedor conserva total de unidades');
      check(unidadesResumen()===69&&!el('compraPreparar').disabled,'Total correcto con proveedores completos');
      check(el('compraValidacion').textContent.includes('Pedido completo. Listo para preparar las órdenes.')&&!el('compraValidacionIcono').hidden&&!el('compraPreparar').disabled,'Estado completo y botón habilitado');
      quantity.value='36';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      check(unidadesResumen()===70,'Actualizar unidades al editar cantidad');
      quantity.value='35';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      proveedorControl.value='';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      check(el('compraPreparar').disabled&&el('compraValidacionIcono').hidden,'Bloquear preparación cuando falta proveedor');
      check(el('compraAccionResumen').textContent.includes('3 de 4'),'Resumen indica modelos pendientes de proveedor');
      proveedorControl.value='1';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      check(el('compraAccionResumen').textContent.includes('69')&&!el('compraResumen').querySelector('table'),'Accion compacta de unidades');
      check(!el('compraAccionResumen').textContent.includes('4 de 4')&&el('compraPedidosProveedor').textContent.includes('69'),'Totales por proveedor en lugar de modelos completos');
      document.querySelector('[data-contrato="25"] [data-quitar]').click();check(document.querySelectorAll('[data-contrato]').length===1,'Quitar colegio');
      check(el('compraAccionResumen').textContent.includes('37'),'Actualizar unidades al quitar');
      check(el('colegios-agregados-title').textContent.includes('(1)'),'Contador correcto');
      check(unidadesResumen()===37,'Actualizar resumen al quitar colegio');
      await agregar('25',2);
      check(unidadesResumen()===69&&el('compraAccionResumen').textContent.includes('2 de 4'),'Nuevo colegio conserva proveedores y cantidades');
      document.querySelectorAll('[data-contrato="25"] [data-proveedor]').forEach(s=>{s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));});
      check(unidadesResumen()===69,'Sumar unidades entre colegios');
      proveedorControl.value='2';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      el('compraPreparar').click();await wait(()=>!el('compraRevision').hidden);
      check(!el('ordenEditor').hidden&&el('ordenEditor').inert&&el('compraRevision').classList.contains('open')&&el('compraRevisionContenido').querySelector('table'),'Revisión sustituye edición y muestra tablas');
      check(el('contratoForm').getClientRects().length===0,'Ocultar agregar colegio en revisión');
      check(el('compraRevisionContenido').querySelectorAll('.revision-colegio').length===3,'Conservar distribucion por colegio y proveedor');
      check(el('contratos-title').textContent==='Preparar pedidos','Título de revisión');
      check(el('ordenPaso').textContent==='Busca colegios, asigna proveedores y prepara pedidos','Subtítulo de revisión');
      const indicadores=[...el('compraRevisionContenido').querySelectorAll('.revision-indicadores strong')].map(n=>Number(n.textContent));
      check(indicadores.join(',')==='2,2,69','Indicadores de colegios distintos, proveedores y unidades');
      document.querySelectorAll('#compraRevision details').forEach(n=>{n.open=true;});
      const proveedoresRevision=[...document.querySelectorAll('.revision-proveedor')];
      check(proveedoresRevision.length===2,'Una tarjeta por proveedor');
      const otro=proveedoresRevision.find(p=>p.querySelector('h3').textContent==='Otro proveedor');
      const primero=proveedoresRevision.find(p=>p.querySelector('h3').textContent==='Proveedor de prueba');
      check(otro.querySelector('.revision-proveedor-header p').textContent==='1 colegio · 1 modelo','Singular en colegio y modelo');
      check(primero.querySelector('.revision-proveedor-header p').textContent==='2 colegios · 2 modelos','Plural por proveedor');
      check(otro.querySelectorAll('.revision-colegio').length===1&&primero.querySelectorAll('.revision-colegio').length===2,'Colegios agrupados en cada proveedor');
      check(otro.querySelector('tbody').textContent.includes('Modelo compartido')&&otro.querySelector('tbody').textContent.includes('35')&&!otro.querySelector('tbody').textContent.includes('Anuario'),'Solo modelos y cantidades del proveedor y colegio');
      check(otro.querySelector('h4').textContent==='Santo Domingo Tecnol\u00f3gico Ni\u00f1o','Nombre completo sin truncar');
      check([...document.querySelectorAll('.revision-tabla thead')].every(n=>n.querySelectorAll('th').length===2),'Solo columnas Modelo y Cantidad');
      check(!el('compraRevisionContenido').textContent.includes('Distribución por colegio')&&!el('compraRevisionContenido').textContent.includes('#8')&&!el('compraRevisionContenido').textContent.includes('Cuadro'),'Sin columnas técnicas, categorías ni IDs visibles');
      const totalProveedores=proveedoresRevision.reduce((s,p)=>s+Number(p.querySelector('.revision-proveedor-total').textContent.split(' ')[0]),0);
      check(totalProveedores===69&&el('compraRevisionContenido').querySelector('.revision-total strong').textContent==='69 unidades','Total general coincide con los proveedores');
      check(quantity.disabled,'Bloquear cambios en revisión');
      el('compraEditar').click();check(!quantity.disabled&&el('compraRevision').hidden&&!el('ordenEditor').hidden,'Volver a editar');
      check(quantity.value==='35'&&document.querySelector('[data-proveedor]').value==='2'&&document.querySelectorAll('[data-contrato]').length===2,'Conservar colegios y selecciones');
      el('colegioBusqueda').value='SANTO';el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(quantity.value==='35'&&document.querySelector('[data-proveedor]').value==='2'&&document.querySelector('[data-colegio="8"]').disabled,'Seguir buscando conserva cantidades, proveedores y bloqueo de duplicados');
      check(el('contratoForm').getClientRects().length>0,'Mostrar agregar al editar');
      proveedorControl.value='1';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      el('compraPreparar').click();await wait(()=>!el('compraRevision').hidden);
      el('compraConfirmar').click();
      el('compraRevision').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(el('compraRevision').classList.contains('open'),'No cerrar confirmacion durante el guardado');
      await wait(()=>el('compraRevisionEstado').textContent.includes('Error temporal de prueba'));
      check(el('compraRevision').classList.contains('open')&&el('ordenEditor').inert,'Error visible dentro de confirmacion; permite reintento');
      el('compraConfirmar').click();el('compraConfirmar').click();
      await wait(()=>!el('compraConfirmacion').hidden);
      const encabezado=el('compraConfirmacion').closest('.ordenes-contenido').querySelector('.page-header').getBoundingClientRect();
      const tarjetaGuardada=el('compraConfirmacion').getBoundingClientRect();
      check(Math.abs(encabezado.left-tarjetaGuardada.left)<1&&Math.abs(encabezado.width-tarjetaGuardada.width)<1,'Confirmacion y titulo alineados en la misma columna');
      check(el('contratoForm').getClientRects().length===0&&el('compraRevision').hidden,'Guardar oculta edición y revisión');
      check(!el('compraOrdenesGeneradas').textContent.includes('OC-PRU-0001'),'No presentar pedidos internos como ordenes oficiales');
      check(el('compraOrdenesGeneradas').querySelector('.confirmacion-ordenes')&&el('compraOrdenesGeneradas').textContent.includes('69')&&el('compraOrdenesGeneradas').textContent.includes('Proveedor de prueba'),'Resumen con proveedor, codigo y unidades reales');
      check(!el('compraOrdenesGeneradas').querySelector('.orden-tarjeta')&&!el('compraConfirmacion').querySelector('a[download]')&&!el('compraOrdenesGeneradas').textContent.includes('Borrador'),'Sin tarjetas PDF ni estados repetidos');
      check(location.hash==='#/ordenes/nueva'&&el('compraConfirmacion').querySelector('a').getAttribute('href')==='#/ordenes/guardadas','Sin redireccion automatica y enlace a pendientes');
      el('compraNueva').click();check(document.querySelectorAll('[data-contrato]').length===0&&el('compraResumen').hidden,'Nueva compra');
      check(!el('ordenEditor').hidden&&el('contratoForm').getClientRects().length>0,'Nueva orden reinicia pantalla de edición');
      document.querySelector('[data-page="ordenes/guardadas"]').click();
      await wait(()=>el('ordenesGuardadas')&&el('ordenConsultada').querySelector('[data-preparar]'));
      check(!el('contratoForm')&&document.querySelector('[data-page="ordenes/guardadas"]').classList.contains('active'),'Pantalla guardadas independiente y opción activa');
      check(el('tabPendientes').getAttribute('aria-selected')==='true','Pestaña inicial de pendientes');
      check(el('ordenConsultada').querySelectorAll('[data-orden]:checked').length===3,'Todas las órdenes seleccionadas inicialmente');
      const sinSeleccion=el('ordenConsultada').querySelector('[data-orden="3"]');sinSeleccion.checked=false;sinSeleccion.dispatchEvent(new Event('change',{bubbles:true}));
      el('ordenConsultada').querySelector('[data-ver-pedido="1"]').click();
      await wait(()=>!el('pedidoVista').hidden&&el('pedidoVistaContenido').textContent.includes('10 unidades'));
      check(el('pedidoVistaContenido').textContent.includes('OC-PRU-0001')&&!el('pedidoVistaContenido').textContent.includes('OC-PRU-0002'),'Ojito individual solo un pedido');
      el('pedidoVistaCerrar').click();
      check(!el('ordenConsultada').querySelector('[data-orden="3"]').checked,'Ojito individual conserva seleccion');
      for(const texto of ['OC','OC-PRU','0001']){el('ordenesFiltro').value=texto;el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));}
      await wait(()=>el('ordenConsultada').querySelectorAll('[data-orden]').length===1&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenConsultada').querySelector('[data-ver-proveedor="1"]').click();
      await wait(()=>!el('pedidoVista').hidden&&el('pedidoVistaContenido').textContent.includes('35 unidades'));
      check(el('pedidoVistaContenido').textContent.includes('OC-PRU-0003')&&el('pedidoVistaContenido').textContent.includes('15 unidades'),'Ojito general incluye todos los pendientes y suma por colegio aunque haya filtro');
      el('pedidoVista').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(el('pedidoVista').hidden,'Cerrar vista con Escape');
      el('ordenesFiltro').value='PROVEEDOR DE PRUEBA';el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>el('ordenConsultada').querySelectorAll('[data-orden]').length===3&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(!el('ordenConsultada').querySelector('[data-orden="3"]').checked,'Buscar conserva el pedido desmarcado');
      el('ordenesLimpiar').click();await new Promise(r=>setTimeout(r,400));
      await wait(()=>el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(el('ordenesFiltro').value===''&&el('ordenesLimpiar').hidden&&!el('ordenConsultada').querySelector('[data-orden="3"]').checked,'Limpiar conserva casillas');
      check(el('ordenConsultada').querySelector('[data-seleccion]').textContent.includes('30'),'Resumen de selección parcial');
      el('ordenConsultada').querySelector('[data-preparar]').click();
      await wait(()=>!el('solicitudRevision').hidden);
      check(!el('pedidosPanel').hidden&&el('pedidosPanel').inert&&el('solicitudRevision').classList.contains('open'),'Confirmacion de solicitud sobre pendientes');
      check(el('solicitudRevisionContenido').textContent.includes('30')&&!el('solicitudRevisionContenido').textContent.includes('OC-PRU-0003'),'Revisión incluye únicamente órdenes elegidas');
      el('solicitudVolver').click();check(!el('ordenConsultada').querySelector('[data-orden="3"]').checked,'Volver conserva selección');
      el('ordenConsultada').querySelector('[data-preparar]').click();await wait(()=>!el('solicitudRevision').hidden);
      el('solicitudConfirmar').click();el('solicitudConfirmar').click();
      await wait(()=>el('tabRealizados').getAttribute('aria-selected')==='true'&&el('ordenConsultada').textContent.includes('OC-MAS-000001'));
      check(el('ordenConsultada').textContent.includes('Generada'),'Historial muestra estado Generada');
      el('tabPendientes').click();await wait(()=>el('ordenConsultada').querySelectorAll('[data-orden]').length===1);
      check(el('ordenConsultada').querySelector('[data-orden]').dataset.orden==='3','Pedido no seleccionado permanece pendiente');
      el('tabRealizados').click();await wait(()=>el('ordenConsultada').querySelector('[data-ver-orden]'));
      await wait(()=>el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesFiltro').value='Proveedor';el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,400));
      await wait(()=>el('ordenConsultada').querySelector('.orden-generada-fila')&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(el('ordenConsultada').querySelectorAll('.ordenes-generadas-proveedor').length===2,'Agrupar por proveedor sin fusionar ordenes');
      check(el('ordenConsultada').querySelector('.ordenes-generadas-encabezado').textContent.includes('37 unidades'),'Total de ordenes del proveedor en la pagina');
      check(!el('ordenConsultada').querySelector('[data-detalles]'),'Sin boton Ver detalles');
      const detalleButton=el('ordenConsultada').querySelector('[data-ver-orden="2"]');detalleButton.click();
      await wait(()=>!el('pedidoVista').hidden&&el('pedidoVistaContenido').textContent.includes('SC-000007'));
      check(el('pedidoVistaContenido').textContent.includes('Colegio historico')&&el('pedidoVistaContenido').textContent.includes('Modelo historico')&&el('pedidoVistaContenido').textContent.includes('7 unidades')&&!el('pedidoVistaContenido').textContent.includes('OC-MAS-000001'),'Ojito solo de la orden elegida y datos historicos');
      el('pedidoVistaCerrar').click();check(el('pedidoVista').hidden,'Cerrar detalle de orden');
      await wait(()=>el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesSiguiente').click();await wait(()=>el('ordenConsultada').textContent.includes('SC-000009')&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(el('ordenConsultada').querySelectorAll('.orden-generada-fila').length===1,'Segunda pagina agrupada sin duplicar filas');
      el('ordenesAnterior').click();await wait(()=>el('ordenConsultada').querySelectorAll('.orden-generada-fila').length===3&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesFiltro').value='SC-000007';el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>el('ordenConsultada').querySelectorAll('.orden-generada-fila').length===1&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(el('ordenConsultada').querySelector('.orden-generada-fila').textContent.includes('SC-000007'),'Filtro por codigo historico conserva agrupacion');
      check(el('ordenConsultada').querySelector('a[target="_blank"]'),'Vista previa de orden anterior');
      el('ordenConsultada').querySelector('a[download]').click();
      await wait(()=>el('solicitudEstado').textContent.includes('PDF descargado'));
      await wait(()=>el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesFiltro').value='inexistente';el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>el('ordenesEstado').textContent.includes('No hay órdenes'));
      document.querySelector('[data-page="ordenes/nueva"]').click();
      await wait(()=>el('colegioBusqueda')&&!el('colegioBusqueda').disabled&&el('colegioReintentar').hidden);
      await agregar('8',1);
      check(!el('ordenesBuscador'),'Navegar de vuelta mantiene pantallas separadas');
      return 'Flujo de interfaz correcto';
    })()` });
    assert.equal(outcome.result?.exceptionDetails, undefined, JSON.stringify(outcome.result?.exceptionDetails));
    assert.equal(outcome.result?.result?.value, 'Flujo de interfaz correcto');
    assert.equal(confirmaciones, 1);
    assert.equal(intentosConfirmar, 2, 'Un fallo y un reintento sin doble envío');
    assert.equal(cargasListado,3,'Una carga inicial con reintento y otra al regresar a la pantalla, sin peticiones por letra');
    assert.equal(solicitudesGeneradas,1,'Doble clic genera una sola solicitud');
    assert.ok(!consultasPendientes.includes('OC')&&!consultasPendientes.includes('OC-PRU'),'Debounce evita consultar por cada letra');
    assert.equal(descargas, 1);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const dimensions = await call('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.scrollWidth <= window.innerWidth' });
    assert.equal(dimensions.result?.result?.value, true, 'Sin desbordamiento horizontal en móvil');
    const summaryLayout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { return !document.getElementById('compraResumen').hidden && !document.querySelector('#ordenEditor .stat-card') && document.getElementById('compraPreparar').getBoundingClientRect().width<=window.innerWidth; })()` });
    assert.equal(summaryLayout.result?.result?.value,true,'Indicadores lado a lado también en móvil');
    const mobileReview = await call('Runtime.evaluate', {awaitPromise:true,returnByValue:true,expression:`(async()=>{
      document.querySelectorAll('[data-proveedor]').forEach(n=>{n.value='1';n.dispatchEvent(new Event('change',{bubbles:true}));});
      document.getElementById('compraPreparar').click();
      for(let i=0;i<100&&document.getElementById('compraRevision').hidden;i++)await new Promise(r=>setTimeout(r,30));
      const review=document.getElementById('compraRevision');
      review.querySelectorAll('details').forEach(n=>{n.open=true;});
      const cards=[...review.querySelectorAll('.revision-indicadores .resumen-indicador')];
      const table=review.querySelector('.revision-tabla');
      const name=review.querySelector('h4');
      return !review.hidden&&cards.length===3&&cards.every(c=>Math.abs(c.getBoundingClientRect().top-cards[0].getBoundingClientRect().top)<1)&&table.scrollWidth<=table.clientWidth+1&&name.scrollWidth<=name.clientWidth+1&&document.documentElement.scrollWidth<=window.innerWidth;
    })()`});
    assert.equal(mobileReview.result?.result?.value,true,'Revisión móvil: indicadores, nombres largos y tablas sin desbordamiento');
    const mobileQuick=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout vista movil');};
      document.getElementById('compraEditar').click();document.querySelector('[data-page="ordenes/guardadas"]').click();
      await wait(()=>document.querySelector('[data-ver-proveedor]'));
      document.querySelector('[data-ver-proveedor]').click();
      await wait(()=>document.getElementById('pedidoVistaContenido').textContent.includes('5 unidades'));
      const modal=document.getElementById('pedidoVista');const tabla=modal.querySelector('table');
      const bien=modal.classList.contains('open')&&tabla.scrollWidth<=tabla.clientWidth+1&&document.documentElement.scrollWidth<=window.innerWidth;
      document.getElementById('pedidoVistaCerrar').click();return bien&&modal.hidden;
    })()`});
    assert.equal(mobileQuick.result?.result?.value,true,'Ojito móvil sin desbordamiento y cierre correcto');
    const mobileHistory=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout historial movil');};
      document.getElementById('tabRealizados').click();
      await wait(()=>document.querySelector('[data-ver-orden="2"]'));
      const sinDesborde=document.documentElement.scrollWidth<=window.innerWidth;
      document.querySelector('[data-ver-orden="2"]').click();
      await wait(()=>document.getElementById('pedidoVistaContenido').textContent.includes('Colegio historico'));
      const modal=document.getElementById('pedidoVista');const tabla=modal.querySelector('table');
      const bien=sinDesborde&&tabla.scrollWidth<=tabla.clientWidth+1&&document.documentElement.scrollWidth<=window.innerWidth;
      document.getElementById('pedidoVistaCerrar').click();return bien&&modal.hidden;
    })()`});
    assert.equal(mobileHistory.result?.result?.value,true,'Historial agrupado y ojito de orden en móvil');
  } finally {
    socket?.close(); browser.kill();
    server.closeAllConnections(); await new Promise((r) => server.close(r));
    await new Promise((r) => setTimeout(r, 500));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
