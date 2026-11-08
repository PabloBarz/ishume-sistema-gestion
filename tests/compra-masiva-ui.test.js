import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

test('navegador: nueva orden, revisión, guardado y navegación a órdenes guardadas', { skip: !process.env.TEST_CHROME, timeout: 40000 }, async () => {
  const app = express();
  app.use(express.json());
  // Identificadores explicitos y productos coherentes en las respuestas de prueba.
  const idsFixture=new Map();
  app.use((req,res,next)=>{const json=res.json.bind(res);res.json=body=>{
    const data=body?.data;
    if(Array.isArray(data?.distribuciones)&&data.distribuciones.length){
      const clave=p=>p.modelo+'|'+(p.categoria??'');
      const distribuciones=data.distribuciones.map(p=>{const k=clave(p);if(!idsFixture.has(k))idsFixture.set(k,idsFixture.size+1);return {...p,id_producto:idsFixture.get(k)};});
      const productos=new Map();for(const p of distribuciones){const previo=productos.get(p.id_producto);productos.set(p.id_producto,{id_producto:p.id_producto,modelo:p.modelo,categoria:p.categoria,cantidad:(previo?.cantidad??0)+p.cantidad});}
      body={...body,data:{...data,distribuciones,productos:[...productos.values()]}};
    }
    return json(body);
  };next();});
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
  let consultasProveedores=0;
  app.get('/api/proveedores', (req, res) => res.json({ data: [{ id_proveedor: 1, razon_social: 'Proveedor de prueba' }, {id_proveedor:2,razon_social:'Otro proveedor'}, ...(consultasProveedores++!==1?[{id_proveedor:97,razon_social:'LíderBook'}]:[])] }));
  app.get('/api/contratos/colegios', (req,res) => { cargasListado++; if(cargasListado===1)return res.status(502).json({message:'Listado temporalmente no disponible'});res.json({data:[8,25,38,404,94,95].map(id=>({id_contrato:id,pedido_registrado:confirmaciones>0&&[8,25].includes(id),colegio:id===94?'22230 Inicial':id===95?'Colegio actualizado sin modelos':id===404?'Colegio error':'Santo Domingo Tecnológico Niño',cliente:'Responsable '+id,fecha_entrega:'2026-12-20',modelos_disponibles:id!==94,aviso_modelos:id===94?'Sin modelos disponibles':''}))}); });
  app.get('/api/contratos', (req, res) => {
    if(req.query.id==='404')return res.status(404).json({message:'Contrato no encontrado'});
    return res.json({ data: {
    pedido_registrado:confirmaciones>0&&[8,25].includes(Number(req.query.id)),
    id_contrato: Number(req.query.id), colegio:'Santo Domingo Tecnol\u00f3gico Ni\u00f1o', estado_trabajo:'en_proceso', promocion:'Promoci\u00f3n', cliente: `Cliente - Colegio ${req.query.id}${req.query.id==='8'?' - BENEFICIO INICIAL AVENIDA MELCHORITA 486 GROCIO':''}`, fecha_entrega: '2026-12-20',
    productos: req.query.id==='95'?[]:[{ id_modelo: 1, modelo: 'Modelo compartido', categoria: 'Cuadro', cantidad: 30 }, { id_modelo: 2, modelo: 'Anuario A', categoria: 'Anuario', cantidad: 2 }].filter(p=>req.query.id==='40'?p.categoria==='Cuadro':req.query.id==='41'?p.categoria==='Anuario':true),
  } });});
  app.get('/api/colegios-compras',(req,res)=>res.json({data:{colegios:[8,38,39].map(id=>({id_contrato:id,id_contrato_api:id,colegio:'Colegio '+id,modelos:2,situaciones:['Sin pedido']})),total:3,pagina:1,paginas:1}}));
  app.get('/api/colegios-compras/:id',(req,res)=>{
    const id=Number(req.params.id.replace('api-',''));
    res.json({data:{id_contrato_api:id,colegio:'Colegio '+id,modelos:2,total:confirmaciones>0&&[8,25].includes(id)?32:0,productos:[{id_modelo:1,modelo:'Modelo compartido',categoria:'Cuadro',cantidad_contratada:30,cantidad:0,cantidad_por_solicitar:30,referencias:[],proveedores:[],situacion:'Por solicitar'},{id_modelo:2,modelo:'Anuario A',categoria:'Book',cantidad_contratada:2,cantidad:0,cantidad_por_solicitar:2,referencias:[],proveedores:[],situacion:'Por solicitar'}]}});
  });
  app.post('/api/compras-masivas/revisar', (req, res) => {
    const grupos = new Map();
    for(const c of req.body.contratos)for(const p of c.productos){
      assert.equal(p.id_modelo===2?p.id_proveedor===97:p.id_proveedor!==97,true,'Guardar asignaciones compatibles');
      if(!grupos.has(p.id_proveedor))grupos.set(p.id_proveedor,{razon_social:p.id_proveedor===1?'Proveedor de prueba':p.id_proveedor===97?'LíderBook':'Otro proveedor',productos:[]});
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
      const comprobarModal=id=>{
        const modal=el(id),cabecera=modal.querySelector('.orden-consulta-datos'),tabla=modal.querySelector('.solicitud-tabla'),cantidad=tabla.querySelector('th:last-child');
        check(getComputedStyle(cabecera).gridTemplateColumns.split(' ').length===2,'Datos generales en dos columnas');
        check(getComputedStyle(cantidad).whiteSpace==='nowrap'&&getComputedStyle(cantidad).textAlign==='right'&&cantidad.getBoundingClientRect().width>=96,'Cantidad con ancho suficiente y sin saltos');
        check(getComputedStyle(modal.querySelector('.orden-consulta-total')).textAlign==='right','Total a la derecha');
      };
      await wait(()=>el('colegioReintentar')&&!el('colegioReintentar').hidden&&!el('colegioBusqueda').disabled); el('colegioReintentar').click(); await wait(()=>!el('colegioBusqueda').disabled&&el('colegioReintentar').hidden);
      check(!el('contratoForm').hidden&&el('colegioResultados').hidden&&!document.querySelector('[data-colegio]'),'Buscador visible sin listado inicial');check(el('contratoColegios').parentElement.hidden,'Sin espacio de colegios antes de seleccionar');check(el('colegioAgregar').hidden&&!el('colegioBuscadorPanel').hidden,'Cero colegios muestra buscador directamente');
      check(!el('compraResumen').querySelector('.resumen-indicador'),'Accion inferior sin tarjetas repetidas');
      check(el('contratos-title').textContent==='Órdenes de compra'&&!el('colegioBusquedaEstado').textContent,'Nombre unificado sin instrucción redundante');
      check(window.location.hash==='#/ordenes/nueva'&&!el('ordenesBuscador'),'Ruta compatible sin órdenes guardadas debajo');
      check(el('ordenesMenu').open,'Submenú abierto en ruta activa');
      const menu=el('ordenesMenu');menu.querySelector('summary').click();check(!menu.open,'Cerrar desplegable');menu.querySelector('summary').click();check(menu.open,'Abrir desplegable');
      const abrirBuscador=()=>{if(el('colegioBuscadorPanel').hidden)el('colegioAgregar').click();};
      const agregar=async(id,n)=>{abrirBuscador();check(!el('colegioBuscadorPanel').hidden,'Mostrar buscador');abrirBuscador();el('colegioBusqueda').value=id==='404'?'error':'santo';el('colegioBusqueda').dispatchEvent(new Event('input'));await wait(()=>document.querySelector('[data-colegio="'+id+'"]'));document.querySelector('[data-colegio="'+id+'"]').click();await wait(()=>document.querySelectorAll('[data-contrato]').length===n&&!el('colegioBusqueda').disabled);check(el('colegioBuscadorPanel').hidden&&!el('colegioAgregar').hidden&&el('colegioResultados').hidden&&el('colegioBusqueda').value==='','Buscador limpio y cerrado tras agregar');};
      for(const texto of ['SANTO','tecnologico','nino']){abrirBuscador();el('colegioBusqueda').value=texto;el('colegioBusqueda').dispatchEvent(new Event('input'));check(document.querySelectorAll('[data-colegio]').length===3,'Busqueda sin mayusculas ni tildes');}
      el('contratoColegios').dispatchEvent(new Event('pointerdown',{bubbles:true}));check(el('colegioResultados').hidden,'Cerrar lista al pulsar fuera del buscador');
      abrirBuscador();el('colegioBusqueda').value='inexistente';el('colegioBusqueda').dispatchEvent(new Event('input'));check(el('colegioBusquedaEstado').textContent==='No se encontraron colegios','Sin coincidencias');
      abrirBuscador();el('colegioBusqueda').value='22230';el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(document.querySelector('[data-colegio="94"]').disabled&&el('colegioResultados').textContent.includes('Sin modelos disponibles'),'Contrato real sin modelos se muestra deshabilitado');
      document.querySelector('[data-colegio="94"]').click();check(!document.querySelector('[data-contrato="94"]'),'No agrega contratos sin modelos');
      await agregar('8',1);
      const primeraTarjeta=document.querySelector('[data-contrato="8"]');
      const valoresAntes=[...primeraTarjeta.querySelectorAll('input,select')].map(n=>n.value).join('/');
      abrirBuscador();el('colegioBusqueda').value='santo';el('colegioBusqueda').dispatchEvent(new Event('input'));
      el('colegioCancelar').click();
      check(el('colegioBuscadorPanel').hidden&&!el('colegioAgregar').hidden&&el('colegioBusqueda').value===''&&[...primeraTarjeta.querySelectorAll('input,select')].map(n=>n.value).join('/')===valoresAntes,'Cancelar limpia búsqueda sin alterar colegio ni controles');
      abrirBuscador();el('colegioBusqueda').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(el('colegioBuscadorPanel').hidden,'Escape cierra búsqueda con colegios agregados');
      check(el('contratoColegios').compareDocumentPosition(el('colegioAgregar'))&Node.DOCUMENT_POSITION_FOLLOWING,'Agregar debajo de colegios');
      check(el('contratoColegios').compareDocumentPosition(el('contratoForm'))&Node.DOCUMENT_POSITION_FOLLOWING,'Buscador debajo de colegios');
      check(el('colegioBuscadorPanel').querySelector('label').textContent==='Agregar otro colegio','Etiqueta con colegios');
      check([...document.querySelectorAll('.colegio-card')].every(card=>!card.hasAttribute('tabindex')&&getComputedStyle(card).outlineStyle==='none'),'Tarjetas sin foco ni contorno de seleccion');
      check(el('contratoForm').compareDocumentPosition(el('compraResumen'))&Node.DOCUMENT_POSITION_FOLLOWING,'Resumen despues del buscador');
      check(el('colegioBusqueda').placeholder==='Buscar otro colegio...'&&document.querySelectorAll('#colegioBusqueda').length===1,'Un unico buscador contextual');
      await agregar('25',2);
      check(document.querySelector('[data-contrato="8"]')===primeraTarjeta,'Agregar conserva el DOM del primer colegio');
      check(!el('colegios-agregados-title')&&document.querySelectorAll('[data-contrato]').length===2,'Tarjetas sin encabezado ni contador');
      check(!document.querySelector('[data-contrato="8"] .compra-categoria'),'Sin encabezados visuales de categorías');
      check(document.querySelector('[data-contrato="8"]').querySelectorAll('table').length===1&&document.querySelector('[data-contrato="8"]').querySelectorAll('thead').length===1,'Una tabla continua por colegio');
      check([...document.querySelectorAll('[data-contrato="8"] tbody tr')].map(n=>n.cells[0].textContent).join(',')==='Modelo compartido,Anuario A','Todos los modelos conservan el orden de origen');
      check(el('pedidoIndicadorProveedores').textContent==='1','Proveedor automatico repetido entre colegios cuenta una vez');
      const controlPaso=document.querySelector('[data-contrato="8"] [data-cantidad="0"]');
      document.querySelector('[data-contrato="8"] [data-cantidad-step="-1"]').click();check(controlPaso.value==='30','Menos respeta minimo contratado');
      document.querySelector('[data-contrato="8"] [data-cantidad-step="1"]').click();check(controlPaso.value==='31'&&document.querySelector('[data-contrato="8"] [data-extra="0"]').textContent==='+1 extra','Mas reutiliza calculo de extras');
      document.querySelector('[data-contrato="8"] [data-cantidad-step="-1"]').click();check(controlPaso.value==='30'&&document.querySelector('[data-contrato="8"] [data-extra="0"]').textContent==='','Menos restaura cantidad sin extra');
      check(document.querySelector('[data-contrato="8"] h2').textContent==='Santo Domingo Tecnol\u00f3gico Ni\u00f1o','Nombre real de colegio sin sustituir por cliente');
      abrirBuscador();el('colegioBusqueda').value='santo';el('colegioBusqueda').dispatchEvent(new Event('input'));check(document.querySelector('[data-colegio="8"]').disabled,'Evitar duplicado por contrato');
      check(!document.querySelector('[data-numero]')&&[...document.querySelectorAll('.colegio-header')].every(n=>!n.textContent.includes('Contrato #')&&!n.textContent.includes('Entrega:')),'Cabeceras sin numeracion, contrato ni fecha');
      check([...document.querySelectorAll('[data-proveedor="1"]')].every(n=>n.value==='97')&&[...document.querySelectorAll('[data-proveedor="0"]')].every(n=>n.value===''),'Anuarios preseleccionan ID del catálogo, cuadros sin proveedor');
      check([...document.querySelectorAll('[data-proveedor="1"]')].every(n=>n.disabled&&n.options.length===1)&&[...document.querySelectorAll('[data-proveedor="0"]')].every(n=>![...n.options].some(o=>o.value==='97')),'Opciones filtradas y anuarios fijos');
      abrirBuscador();el('colegioBusqueda').value='actualizado';el('colegioBusqueda').dispatchEvent(new Event('input'));
      document.querySelector('[data-colegio="95"]').click();
      await wait(()=>el('contratoEstado').textContent.includes('Sin modelos disponibles'));
      el('colegioBusqueda').focus();el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(document.querySelectorAll('[data-contrato]').length===2&&document.querySelector('[data-colegio="95"]').disabled,'Consulta individual sin modelos conserva colegios y actualiza disponibilidad');
      abrirBuscador();el('colegioBusqueda').value='error';el('colegioBusqueda').dispatchEvent(new Event('input'));document.querySelector('[data-colegio="404"]').click();await wait(()=>el('contratoEstado').textContent.includes('Contrato no encontrado'));
      check(document.querySelectorAll('[data-contrato]').length===2&&!el('colegioBusqueda').disabled&&!el('colegioBusqueda').disabled,'Recuperar controles sin perder colegios');
      const quantity=document.querySelector('[data-cantidad]');quantity.value='35';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      el('compraPreparar').click();check(el('compraRevision').hidden,'Bloquear proveedor faltante');
      check(el('compraResumen').hidden&&el('compraPreparar').disabled,'Sin resumen ni guardado cuando no hay proveedores');
      const primerProveedor=document.querySelector('[data-proveedor]');
      primerProveedor.value='1';primerProveedor.dispatchEvent(new Event('change',{bubbles:true}));
      check(el('compraResumen').hidden&&el('compraPreparar').disabled,'Sin resumen parcial al seleccionar un proveedor');
      document.querySelectorAll('[data-proveedor]').forEach(s=>{s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));});
      const proveedorControl=document.querySelector('[data-proveedor]');
      proveedorControl.value='2';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      const unidadesResumen=()=>Number(el('compraAccionResumen').textContent.match(/([0-9]+) unidades/)[1]);
      check(el('pedidoIndicadorProveedores').textContent==='3','Tres proveedores distintos entre colegios');
      check(unidadesResumen()===69,'Reasignar proveedor conserva total de unidades');
      check(unidadesResumen()===69&&!el('compraPreparar').disabled,'Total correcto con proveedores completos');
      check(!el('compraResumen').hidden,'Mostrar resumen completo automáticamente');
      quantity.value='0';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      check(el('pedidoIndicadorProveedores').textContent==='2','Cantidad cero excluye proveedor sin otros modelos');
      check(el('compraResumen').hidden&&el('compraPreparar').disabled,'Cantidad inválida oculta resumen');
      quantity.value='35';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      check(quantity.closest('[data-contrato]').querySelector('[data-total]').textContent==='Total a solicitar: 37 unidades'&&!quantity.closest('[data-contrato]').textContent.includes('Original:'),'Pie compacto con total solicitado actualizado');
      check(!el('compraResumen').hidden&&unidadesResumen()===69,'Corregir cantidad recupera resumen actualizado');
      check(el('compraValidacion').hidden&&!el('compraPreparar').disabled,'Resumen completo sin mensaje repetido y botón habilitado');
      quantity.value='36';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      check(unidadesResumen()===70,'Actualizar unidades al editar cantidad');
      quantity.value='35';quantity.dispatchEvent(new Event('input',{bubbles:true}));
      proveedorControl.value='';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      check(el('compraPreparar').disabled&&el('compraValidacionIcono').hidden,'Bloquear preparación cuando falta proveedor');
      check(el('compraResumen').hidden&&quantity.value==='35','Quitar proveedor oculta resumen sin perder cantidades');
      proveedorControl.value='1';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      check(el('compraAccionResumen').textContent.includes('69')&&!el('compraResumen').querySelector('table'),'Accion compacta de unidades');
      check(!el('compraAccionResumen').textContent.includes('4 de 4')&&el('compraPedidosProveedor').textContent.includes('LíderBook'),'Totales por proveedor incluyen anuarios automáticos');
      document.querySelector('[data-contrato="25"] [data-quitar]').click();check(document.querySelectorAll('[data-contrato]').length===1,'Quitar colegio');
      check([...document.querySelectorAll('.toast-info')].some(t=>t.textContent.includes('Colegio quitado del pedido')),'Quitar del formulario no anuncia un guardado en MySQL');
      check(el('pedidoIndicadorProveedores').textContent==='2','Quitar colegio actualiza proveedores distintos');
      check(el('compraAccionResumen').textContent.includes('37'),'Actualizar unidades al quitar');
      check(document.querySelectorAll('[data-contrato]').length===1,'Quitar colegio conserva las otras tarjetas');
      check(unidadesResumen()===37,'Actualizar resumen al quitar colegio');
      await agregar('25',2);
      check(el('compraResumen').hidden&&quantity.value==='35'&&proveedorControl.value==='1','Nuevo colegio incompleto oculta resumen y conserva selecciones');
      document.querySelectorAll('[data-contrato="25"] [data-proveedor]').forEach(s=>{s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));});
      check(unidadesResumen()===69,'Sumar unidades entre colegios');
      proveedorControl.value='2';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      el('compraPreparar').click();await wait(()=>!el('compraRevision').hidden);
      check(!el('ordenEditor').hidden&&el('ordenEditor').inert&&el('compraRevision').classList.contains('open')&&el('compraRevisionContenido').querySelector('table'),'Revisión sustituye edición y muestra tablas');
      check(el('contratoForm').getClientRects().length===0,'Ocultar agregar colegio en revisión');
      check(el('compraRevisionContenido').querySelectorAll('.revision-colegio').length===4,'Conservar distribucion por colegio y proveedor');
      check(el('contratos-title').textContent==='Órdenes de compra','Título de revisión');
      check(el('ordenPaso').textContent==='Selecciona colegios y asigna proveedores a sus productos','Subtítulo de revisión');
      check(!el('compraRevisionContenido').querySelector('.revision-indicadores')&&el('compraRevisionContenido').querySelector('.revision-resumen-linea').textContent==='2 colegios · 3 proveedores · 69 unidades','Resumen de revisión en una sola línea');
      check([...document.querySelectorAll('#compraRevision details')].every(n=>!n.open),'Detalles cerrados inicialmente');
      document.querySelectorAll('#compraRevision details').forEach(n=>{n.open=true;});
      const proveedoresRevision=[...document.querySelectorAll('.revision-proveedor')];
      check(proveedoresRevision.length===3,'Una tarjeta por proveedor');
      const otro=proveedoresRevision.find(p=>p.querySelector('.revision-proveedor-nombre').textContent==='Otro proveedor');
      const primero=proveedoresRevision.find(p=>p.querySelector('.revision-proveedor-nombre').textContent==='Proveedor de prueba');
      check(otro.querySelectorAll('.revision-colegio').length===1&&primero.querySelectorAll('.revision-colegio').length===1,'Colegios agrupados en cada proveedor');
      check(otro.querySelector('tbody').textContent.includes('Modelo compartido')&&otro.querySelector('tbody').textContent.includes('35')&&!otro.querySelector('tbody').textContent.includes('Anuario'),'Solo modelos y cantidades del proveedor y colegio');
      check(otro.querySelector('h4').textContent==='Santo Domingo Tecnol\u00f3gico Ni\u00f1o','Nombre completo sin truncar');
      check([...document.querySelectorAll('.revision-tabla thead')].every(n=>n.querySelectorAll('th').length===2),'Solo columnas Modelo y Cantidad');
      check(!el('compraRevisionContenido').textContent.includes('Distribución por colegio')&&!el('compraRevisionContenido').textContent.includes('#8')&&!el('compraRevisionContenido').textContent.includes('Cuadro'),'Sin columnas técnicas, categorías ni IDs visibles');
      const totalProveedores=proveedoresRevision.reduce((s,p)=>s+Number(p.querySelector('.revision-proveedor-total').textContent.split(' ')[0]),0);
      check(totalProveedores===69,'Total general coincide con la lista compacta de proveedores');
      check(quantity.disabled,'Bloquear cambios en revisión');
      el('compraEditar').click();check(!quantity.disabled&&el('compraRevision').hidden&&!el('ordenEditor').hidden,'Volver a editar');
      check(quantity.value==='35'&&document.querySelector('[data-proveedor]').value==='2'&&document.querySelectorAll('[data-contrato]').length===2,'Conservar colegios y selecciones');
      abrirBuscador();el('colegioBusqueda').value='SANTO';el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(quantity.value==='35'&&document.querySelector('[data-proveedor]').value==='2'&&document.querySelector('[data-colegio="8"]').disabled,'Seguir buscando conserva cantidades, proveedores y bloqueo de duplicados');
      check(el('contratoForm').getClientRects().length>0,'Mostrar agregar al editar');
      proveedorControl.value='1';proveedorControl.dispatchEvent(new Event('change',{bubbles:true}));
      el('compraPreparar').click();await wait(()=>!el('compraRevision').hidden);
      el('compraConfirmar').click();
      el('compraRevision').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      check(el('compraRevision').classList.contains('open'),'No cerrar confirmacion durante el guardado');
      await wait(()=>el('compraRevisionEstado').textContent.includes('Error temporal de prueba'));
      check([...document.querySelectorAll('.toast-error')].some(t=>t.textContent.includes('Error temporal de prueba')),'Toast de error conserva la revision sin anunciar exito');
      check(el('compraRevision').classList.contains('open')&&el('ordenEditor').inert,'Error visible dentro de confirmacion; permite reintento');
      el('compraConfirmar').click();el('compraConfirmar').click();
      await wait(()=>[...document.querySelectorAll('.toast-success')].some(n=>n.textContent.includes('1 pedido guardado')));
      check(!el('compraConfirmacion')&&el('compraRevision').hidden,'Sin modal de exito ni pasos posteriores');
      const toastGuardado=[...document.querySelectorAll('.toast-success')].find(n=>n.textContent.includes('1 pedido guardado'));
      const medidasToast=toastGuardado.getBoundingClientRect(),estiloToast=getComputedStyle(toastGuardado);
      check(medidasToast.width>=260&&medidasToast.width<=360&&medidasToast.height>=48&&medidasToast.height<=56,'Toast de exito compacto');
      check(estiloToast.borderLeftWidth==='3px'&&estiloToast.borderRightWidth==='1px'&&estiloToast.borderLeftColor!==estiloToast.borderRightColor,'Franja lateral original');
      check(toastGuardado.querySelector('.toast-icon-success').classList.contains('bi-check-circle-fill'),'Check discreto compartido');
      const iconoToast=getComputedStyle(toastGuardado.querySelector('.toast-icon-success'));
      check(iconoToast.color===estiloToast.borderLeftColor&&iconoToast.backgroundColor==='rgba(0, 0, 0, 0)'&&iconoToast.fontSize==='18px','Check verde original');
      check(estiloToast.backgroundColor==='rgb(255, 255, 255)'&&parseFloat(estiloToast.borderRadius)>0,'Fondo blanco y esquinas originales');
      check(location.hash==='#/ordenes/nueva'&&document.querySelectorAll('[data-contrato]').length===0&&el('compraResumen').hidden,'Exito limpia los colegios y conserva la pantalla');
      check(!el('ordenEditor').hidden&&el('contratoForm').getClientRects().length>0,'Formulario listo para otro pedido');
      const {showToast}=await import('/js/utils.js');
      showToast('Notificacion segura <b>texto</b>','success',60);showToast('Notificacion segura <b>texto</b>','success',60);
      check([...document.querySelectorAll('.toast-success')].filter(t=>t.textContent.includes('Notificacion segura')).length===1,'Toast deduplicado');
      check(!document.querySelector('.toast-message b'),'Mensaje no interpreta HTML');
      await wait(()=>![...document.querySelectorAll('.toast-item')].some(t=>t.textContent.includes('Notificacion segura')));
      const aviso=showToast('Aviso de prueba','warning',0);check(aviso.getAttribute('aria-live')==='polite','Toast accesible');aviso.querySelector('button').click();
      document.querySelector('[data-page="ordenes/guardadas"]').click();
      await wait(()=>el('ordenesGuardadas')&&el('ordenConsultada').querySelector('[data-preparar]'));
      check(!el('contratoForm')&&document.querySelector('[data-page="ordenes/guardadas"]').classList.contains('active'),'Pantalla guardadas independiente y opción activa');
      check(el('tabPendientes').getAttribute('aria-selected')==='true','Pestaña inicial de pendientes');
      check(el('ordenConsultada').querySelectorAll('[data-orden]:checked').length===3,'Todas las órdenes seleccionadas inicialmente');
      check(el('ordenesPaginacion').hidden&&!el('ordenesEstado').textContent,'Sin paginación ni instrucciones cuando hay una sola página');
      check(!el('ordenConsultada').querySelector('.pedido-eleccion small')&&el('ordenConsultada').textContent.includes('35 unidades pendientes'),'Pendientes sin fechas ni conteos secundarios');
      const sinSeleccion=el('ordenConsultada').querySelector('[data-orden="3"]');sinSeleccion.checked=false;sinSeleccion.dispatchEvent(new Event('change',{bubbles:true}));
      el('ordenConsultada').querySelector('[data-ver-pedido="1"]').click();
      await wait(()=>!el('pedidoVista').hidden&&el('pedidoVistaContenido').textContent.includes('10 unidades'));
      comprobarModal('pedidoVista');
      check(el('pedidoVistaContenido').textContent.includes('OC-PRU-0001')&&!el('pedidoVistaContenido').textContent.includes('OC-PRU-0002'),'Ojito individual solo un pedido');
      el('pedidoVistaCerrar').click();
      check(!el('ordenConsultada').querySelector('[data-orden="3"]').checked,'Ojito individual conserva seleccion');
      for(const texto of ['OC','OC-PRU','0001']){el('ordenesFiltro').value=texto;el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));}
      await wait(()=>el('ordenConsultada').querySelectorAll('[data-orden]').length===1&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenConsultada').querySelector('[data-ver-proveedor="1"]').click();
      await wait(()=>!el('pedidoVista').hidden&&el('pedidoVistaContenido').textContent.includes('35 unidades'));
      check(el('pedidoVistaContenido').textContent.includes('OC-PRU-0003')&&el('pedidoVistaContenido').textContent.includes('35 unidades'),'Ojito general consolida todos los pendientes aunque haya filtro');
      comprobarModal('pedidoVista');
      check(el('pedidoVistaContenido').querySelectorAll('.orden-consulta-codigos li').length===3&&!el('pedidoVistaContenido').querySelector('.orden-consulta-codigos').textContent.includes('23/10/2026'),'Codigos separados sin fechas repetidas');
      check(el('pedidoVistaContenido').querySelectorAll('table').length===1&&!el('pedidoVistaContenido').querySelector('details'),'Consulta de pendientes usa tabla única sin tarjetas ni desplegables');
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
      comprobarModal('solicitudRevision');
      check(el('solicitudRevisionContenido').querySelectorAll('.orden-consulta-codigos li').length===2,'Confirmacion muestra solo codigos incluidos');
      check(el('solicitudRevisionContenido').textContent.includes('30')&&!el('solicitudRevisionContenido').textContent.includes('OC-PRU-0003'),'Revisión incluye únicamente órdenes elegidas');
      check(!el('solicitudRevisionContenido').querySelector('summary')&&!el('solicitudRevisionContenido').textContent.includes('Segundo colegio'),'Confirmación compacta conserva desplegable sin códigos repetidos');
      el('solicitudVolver').click();check(!el('ordenConsultada').querySelector('[data-orden="3"]').checked,'Volver conserva selección');
      el('ordenConsultada').querySelector('[data-preparar]').click();await wait(()=>!el('solicitudRevision').hidden);
      el('solicitudConfirmar').click();el('solicitudConfirmar').click();
      await wait(()=>el('tabRealizados').getAttribute('aria-selected')==='true'&&el('ordenConsultada').textContent.includes('OC-MAS-000001'));
      check(!el('ordenConsultada').querySelector('.orden-generada-estado'),'Sin estado redundante en generadas');
      check([...document.querySelectorAll('.toast-success')].some(t=>t.textContent.includes('Orden de compra generada'))&&!el('solicitudEstado').textContent,'Un solo resultado de consolidacion, sin exito duplicado debajo del listado');
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
      const detalleButton=el('ordenConsultada').querySelector('[data-ver-orden="2"]');
      const acciones=detalleButton.parentElement;
      check(acciones.children.length===4&&detalleButton.title==='Ver detalle'&&!detalleButton.textContent.trim(),'Tres acciones y ojo accesible');
      check(acciones.querySelector('a[href="#/pagos?localizar=2"]').textContent==='Pagos'&&!acciones.querySelector('a[target="_blank"]'),'Pagos y descarga sin vista previa repetida');
      detalleButton.click();
      await wait(()=>!el('pedidoVista').hidden&&el('pedidoVistaContenido').textContent.includes('SC-000007'));
      check(!el('pedidoVistaContenido').textContent.includes('Colegio historico')&&el('pedidoVistaContenido').textContent.includes('Modelo historico')&&el('pedidoVistaContenido').textContent.includes('7 unidades')&&!el('pedidoVistaContenido').textContent.includes('OC-MAS-000001'),'Ojito solo de la orden elegida y datos historicos');
      comprobarModal('pedidoVista');
      check(el('pedido-vista-title').textContent==='Detalle de orden de compra'&&el('pedidoVista').classList.contains('orden-consulta'),'Título y estilo exclusivos del detalle generado');
      check(el('pedidoVistaContenido').querySelectorAll('table').length===1&&el('pedidoVistaContenido').querySelectorAll('thead').length===1&&!el('pedidoVistaContenido').querySelector('details')&&!el('pedidoVistaContenido').querySelector('.solicitud-revision-colegio'),'Una tabla sin desplegables ni tarjetas por colegio');
      check(el('pedidoVistaContenido').querySelector('.orden-consulta-datos').textContent.includes('01/10/2026')&&el('pedidoVistaContenido').querySelector('.orden-consulta-datos').textContent.includes('Proveedor de prueba'),'Metadatos reales de la orden');
      check(!el('pedidoVistaPdf').hidden&&el('pedidoVistaPdf').getAttribute('href')==='/api/compras-masivas/solicitudes/2/pdf?vista=1'&&el('pedidoVistaPdf').target==='_blank','Ver PDF de la orden dentro del detalle');
      el('pedidoVistaCerrar').click();check(el('pedidoVista').hidden,'Cerrar detalle de orden');
      await wait(()=>el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesSiguiente').click();await wait(()=>el('ordenConsultada').textContent.includes('SC-000009')&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(el('ordenConsultada').querySelectorAll('.orden-generada-fila').length===1,'Segunda pagina agrupada sin duplicar filas');
      el('ordenesAnterior').click();await wait(()=>el('ordenConsultada').querySelectorAll('.orden-generada-fila').length===3&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesFiltro').value='SC-000007';el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>el('ordenConsultada').querySelectorAll('.orden-generada-fila').length===1&&el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      check(el('ordenConsultada').querySelector('.orden-generada-fila').textContent.includes('SC-000007'),'Filtro por codigo historico conserva agrupacion');
      check(!el('ordenConsultada').querySelector('a[target="_blank"]'),'Vista previa solo en detalle');
      el('ordenConsultada').querySelector('a[download]').click();
      await wait(()=>[...document.querySelectorAll('.toast-success')].some(t=>t.textContent.includes('PDF descargado')));
      await wait(()=>el('ordenesBuscador').getAttribute('aria-busy')!=='true');
      el('ordenesFiltro').value='inexistente';el('ordenesFiltro').dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>el('ordenesEstado').textContent.includes('No hay órdenes'));
      document.querySelector('[data-page="ordenes/nueva"]').click();
      await wait(()=>el('colegioBusqueda')&&!el('colegioBusqueda').disabled&&el('colegioReintentar').hidden);
      abrirBuscador();el('colegioBusqueda').value='santo';el('colegioBusqueda').dispatchEvent(new Event('input'));
      check(document.querySelector('[data-colegio="8"]').disabled&&document.querySelector('[data-colegio="8"]').textContent.includes('Pedido registrado')&&!document.querySelector('[data-colegio="38"]').disabled,'Pedido registrado persiste y otro contrato del mismo colegio disponible');
      await agregar('38',1);
      check([...document.querySelectorAll('[data-proveedor]')].every(n=>n.value==='')&&el('compraResumen').hidden,'Sin LíderBook disponible no inventar proveedor ni habilitar resumen');
      check(document.querySelector('[data-proveedor="1"]').disabled&&document.querySelector('[data-contrato]').textContent.includes('LíderBook no está disponible'),'Error claro si falta proveedor de anuarios');
      document.querySelector('[data-page="dashboard"]').click();await wait(()=>el('dashboard-title'));
      document.querySelector('[data-page="ordenes/nueva"]').click();await wait(()=>el('colegioBusqueda')&&!el('colegioBusqueda').disabled&&el('colegioReintentar').hidden);
      check(document.querySelectorAll('[data-contrato]').length===1&&document.querySelector('[data-contrato="38"]'),'Navegar restaura el borrador');
      const cantidadBorrador=document.querySelector('[data-contrato="38"] [data-cantidad="0"]');cantidadBorrador.value='33';cantidadBorrador.dispatchEvent(new Event('input',{bubbles:true}));
      const proveedorBorrador=document.querySelector('[data-contrato="38"] [data-proveedor="0"]');proveedorBorrador.value='2';proveedorBorrador.dispatchEvent(new Event('change',{bubbles:true}));
      check(!document.querySelector('[data-contrato="38"] .colegio-consulta-link'),'Sin enlace Ver colegio en el encabezado');
      location.hash='#/compras/colegios?contrato=38';
      await wait(()=>el('colegiosConsultaDetalle')&&!el('colegiosConsultaDetalle').hidden);
      check(location.hash.includes('contrato=38')&&el('colegiosConsultaDetalle').textContent.includes('Colegio 38'),'Ver colegio consulta el ID real');
      check(!document.querySelector('.colegio-preparar-link'),'Consulta sin enlaces para preparar');location.hash='#/ordenes/nueva?contrato='+el('colegiosConsultaDetalle').dataset.contrato;
      await wait(()=>el('colegioBusqueda')&&!el('colegioBusqueda').disabled&&document.querySelector('[data-contrato="38"]'));
      check(document.querySelector('[data-cantidad="0"]').value==='33'&&document.querySelector('[data-proveedor="0"]').value==='2','Conserva cantidades y proveedores al consultar y volver');
      location.hash='#/ordenes/nueva?contrato=8';
      await wait(()=>el('contratoEstado')?.textContent.includes('ya tiene un pedido registrado'));
      check(!document.querySelector('[data-contrato="8"]')&&document.querySelector('[data-contrato="38"]'),'Carga directa rechaza contrato registrado sin perder borrador');
      location.hash='#/compras/colegios?contrato=8';
      await wait(()=>el('colegiosConsultaDetalle')&&!el('colegiosConsultaDetalle').hidden);
      check(!document.querySelector('.colegio-preparar-link'),'Consulta bloqueada no ofrece pedidos complementarios');
      location.hash='#/compras/colegios?contrato=39';
      await wait(()=>el('colegiosConsultaDetalle')&&!el('colegiosConsultaDetalle').hidden&&el('colegiosConsultaDetalle').textContent.includes('Colegio 39'));
      check(!document.querySelector('.colegio-preparar-link'),'Consulta sin enlaces para preparar');location.hash='#/ordenes/nueva?contrato='+el('colegiosConsultaDetalle').dataset.contrato;
      await wait(()=>document.querySelector('[data-contrato="39"]')&&el('contratoForm')?.getAttribute('aria-busy')==='false');
      check(document.querySelectorAll('[data-contrato]').length===2&&document.querySelector('[data-contrato="38"] [data-cantidad="0"]').value==='33','Carga contrato nuevo exacto sin sustituir el borrador');
      document.querySelector('[data-contrato="39"] [data-quitar]').click();
      check(!el('ordenesBuscador'),'Navegar de vuelta mantiene pantallas separadas');
      return 'Flujo de interfaz correcto';
    })()` });
    assert.equal(outcome.result?.exceptionDetails, undefined, JSON.stringify(outcome.result?.exceptionDetails));
    assert.equal(outcome.result?.result?.value, 'Flujo de interfaz correcto');
    assert.equal(confirmaciones, 1);
    assert.equal(intentosConfirmar, 2, 'Un fallo y un reintento sin doble envío');
    assert.equal(cargasListado,7,'Carga con reintento, regresos y navegación directa, sin peticiones por letra');
    assert.equal(solicitudesGeneradas,1,'Doble clic genera una sola solicitud');
    assert.ok(!consultasPendientes.includes('OC')&&!consultasPendientes.includes('OC-PRU'),'Debounce evita consultar por cada letra');
    assert.equal(descargas, 1);
    // 1536 px al 100 % y espacio CSS disponible equivalente al 110 %.
    for (const width of [1536, Math.round(1536/1.1)]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      const centered=await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
        const panel=document.querySelector('.preparar-pedidos').getBoundingClientRect();
        const parent=document.querySelector('.page-wrapper').getBoundingClientRect();
        return panel.width<=1200&&Math.abs(panel.left+panel.width/2-parent.left-parent.width/2)<2&&document.documentElement.scrollWidth<=innerWidth;
      })()`});
      assert.equal(centered.result?.result?.value,true,'Preparar pedidos centrado sin desbordamiento: '+width);
      const alineacion=await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
        const centro=n=>{const r=n.getBoundingClientRect();return r.left+r.width/2;};
        return [...document.querySelectorAll('#ordenEditor .compra-table')].every(t=>[...t.querySelectorAll('tbody tr')].every(f=>
          Math.abs(centro(t.tHead.rows[0].cells[2])-centro(f.querySelector('.compra-cantidad-control')))<1&&
          Math.abs(centro(t.tHead.rows[0].cells[3])-centro(f.querySelector('select')))<1&&
          getComputedStyle(t.tHead.rows[0].cells[2]).textAlign==='center'&&getComputedStyle(t.tHead.rows[0].cells[3]).textAlign==='center'));
      })()`});
      assert.equal(alineacion.result?.result?.value,true,'Encabezados centrados sobre controles, tolerancia 1 px: '+width);
    }
    await call('Runtime.evaluate',{awaitPromise:true,expression:"document.querySelectorAll('.toast-item').forEach(n=>n.remove());window.scrollTo(0,0);new Promise(r=>setTimeout(r,250))"});
    const capturaOrden=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'ishume-pedido-desktop.png'),Buffer.from(capturaOrden.result.data,'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await call('Runtime.evaluate',{awaitPromise:true,expression:'new Promise(r=>setTimeout(r,350))'});
    const capturaOrdenMovil=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'ishume-pedido-mobile.png'),Buffer.from(capturaOrdenMovil.result.data,'base64'));
    const dimensions = await call('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.scrollWidth <= window.innerWidth' });
    assert.equal(dimensions.result?.result?.value, true, 'Sin desbordamiento horizontal en móvil');
    const toastMovil=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const {showToast}=await import('/js/utils.js');const toast=showToast('Datos actualizados','success',0),r=toast.getBoundingClientRect();
      const valido=r.width<=innerWidth-24&&r.left>=12&&r.right<=innerWidth-12&&r.height>=48&&r.height<=56;
      toast.querySelector('button').click();return valido;
    })()`});
    assert.equal(toastMovil.result?.result?.value,true,'Toast compacto y alineado en movil');
    const summaryLayout = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { return !document.getElementById('compraResumen').hidden && !document.querySelector('#ordenEditor .stat-card'); })()` });
    assert.equal(summaryLayout.result?.result?.value,true,'Resumen válido del borrador conservado también en móvil');
    const mobileReview = await call('Runtime.evaluate', {awaitPromise:true,returnByValue:true,expression:`(async()=>{
      document.querySelectorAll('[data-proveedor]').forEach(n=>{n.value='1';n.dispatchEvent(new Event('change',{bubbles:true}));});
      document.getElementById('compraPreparar').click();
      for(let i=0;i<100&&document.getElementById('compraRevision').hidden;i++)await new Promise(r=>setTimeout(r,30));
      const review=document.getElementById('compraRevision');
      review.querySelectorAll('details').forEach(n=>{n.open=true;});
      const filas=[...review.querySelectorAll('.revision-proveedor-header')];
      const table=review.querySelector('.revision-tabla');
      const name=review.querySelector('h4');
      return !review.hidden&&filas.length>0&&filas.every(c=>c.scrollWidth<=c.clientWidth+1)&&table.scrollWidth<=table.clientWidth+1&&name.scrollWidth<=name.clientWidth+1&&document.documentElement.scrollWidth<=window.innerWidth;
    })()`});
    assert.equal(mobileReview.result?.result?.value,true,'Revisión móvil: indicadores, nombres largos y tablas sin desbordamiento');
    const categoriasUnicas=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      document.getElementById('compraEditar').click();
      for(const id of [40,41]){
        location.hash='#/ordenes/nueva?contrato='+id;
        for(let i=0;i<150&&!document.querySelector('[data-contrato="'+id+'"]');i++)await new Promise(r=>setTimeout(r,30));
        const card=document.querySelector('[data-contrato="'+id+'"]');
        if(!card||card.querySelectorAll('table').length!==1||card.querySelector('.compra-categoria'))throw Error('Tabla unica sin categorias visibles');
        const proveedor=card.querySelector('[data-proveedor]');
        if(id===41?!proveedor.disabled||proveedor.value!=='97':proveedor.disabled||[...proveedor.options].some(o=>o.value==='97'))throw Error('Reglas de proveedores por categoria intactas');
        card.querySelector('[data-quitar]').click();
      }
      document.querySelectorAll('[data-quitar]').forEach(n=>n.click());
      if(document.getElementById('colegioBuscadorPanel').hidden||!document.getElementById('colegioAgregar').hidden||!document.getElementById('colegioCancelar').hidden)throw Error('Sin colegios debe mostrar buscador directamente');
      if(document.getElementById('pedidoIndicadorColegios').textContent!=='0'||document.getElementById('pedidoIndicadorProveedores').textContent!=='0'||document.getElementById('pedidoIndicadorUnidades').textContent!=='0')throw Error('Indicadores deben quedar en cero');
      return true;
    })()`});
    assert.equal(categoriasUnicas.result?.exceptionDetails,undefined,JSON.stringify(categoriasUnicas.result?.exceptionDetails));
    const mobileQuick=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout vista movil');};
      document.getElementById('compraEditar').click();document.querySelector('[data-page="ordenes/guardadas"]').click();
      await wait(()=>document.querySelector('[data-ver-proveedor]'));
      document.querySelector('[data-ver-proveedor]').click();
      await wait(()=>document.getElementById('pedidoVistaContenido').textContent.includes('5 unidades'));
      const modal=document.getElementById('pedidoVista');const tabla=modal.querySelector('table');
      const bien=getComputedStyle(tabla.querySelector('th:last-child')).whiteSpace==='nowrap'&&modal.classList.contains('open')&&tabla.scrollWidth<=tabla.clientWidth+1&&document.documentElement.scrollWidth<=window.innerWidth;
      document.getElementById('pedidoVistaCerrar').click();return bien&&modal.hidden;
    })()`});
    assert.equal(mobileQuick.result?.result?.value,true,'Ojito móvil sin desbordamiento y cierre correcto');
    const mobileHistory=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout historial movil');};
      document.getElementById('tabRealizados').click();
      await wait(()=>document.querySelector('[data-ver-orden="2"]'));
      const sinDesborde=document.documentElement.scrollWidth<=window.innerWidth;
      document.querySelector('[data-ver-orden="2"]').click();
      await wait(()=>document.getElementById('pedidoVistaContenido').textContent.includes('Modelo historico'));
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
