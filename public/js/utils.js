// Reúne funciones pequeñas de formato y validación compartidas por las vistas.

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
});

const formatoNumero = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
});

const formatoSoles = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
});

function convertirNumero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  if (valor === null || valor === undefined) return null;

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

// Devuelve una fecha legible; si el valor no es válido, devuelve una cadena vacía.
export function formatDate(valor) {
  let fecha = valor;

  if (!(fecha instanceof Date) && typeof valor === 'string') {
    const soloFecha = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (soloFecha) {
      const [, anio, mes, dia] = soloFecha;
      fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
      if (fecha.getFullYear() !== Number(anio) || fecha.getMonth() !== Number(mes) - 1 || fecha.getDate() !== Number(dia)) return '';
    }
  }

  fecha = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(fecha.getTime())) return '';

  return formatoFecha.format(fecha);
}

// Formatea números con la configuración regional peruana.
export function formatNumber(valor) {
  const numero = convertirNumero(valor);
  return numero === null ? '' : formatoNumero.format(numero);
}

// Formatea importes en soles peruanos.
export function formatCurrencyPEN(valor) {
  const numero = convertirNumero(valor);
  return numero === null ? '' : formatoSoles.format(numero);
}

// Retorna los nombres de las propiedades cuyos valores obligatorios están vacíos.
export function validateRequiredFields(valores) {
  return Object.entries(valores).filter(([, valor]) => {
    return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
  }).map(([nombre]) => nombre);
}

// Consume una ruta API y devuelve JSON, texto o null cuando la respuesta está vacía.
export async function http(url, method = 'GET', body = null, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const options = { method, headers: {}, signal: controller.signal };

  if (body !== null && body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  let texto;
  try {
    response = await fetch(url, options);
    texto = await response.text();
  } catch (cause) {
    const error = new Error(controller.signal.aborted ? 'La consulta tardó demasiado. Intenta nuevamente.' : 'Error de red al conectar con el servidor.', { cause });
    error.name = controller.signal.aborted ? 'TimeoutError' : 'NetworkError';
    throw error;
  } finally { clearTimeout(timeout); }

  let data = null;

  if (texto) {
    try {
      data = JSON.parse(texto);
    } catch {
      data = texto;
    }
  }

  if (!response.ok) {
    const message = data && typeof data === 'object' && data.message
      ? data.message
      : typeof data === 'string' && data
        ? data
        : `Error HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function updateDescribedBy(input, errorId, includeError) {
  const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  if (includeError) descriptions.add(errorId);
  else descriptions.delete(errorId);

  if (descriptions.size) input.setAttribute('aria-describedby', [...descriptions].join(' '));
  else input.removeAttribute('aria-describedby');
}

// Muestra un error junto al campo y lo asocia para tecnologías de asistencia.
export function setError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (!input || !error) return;

  input.classList.add('is-invalid');
  input.setAttribute('aria-invalid', 'true');
  updateDescribedBy(input, errorId, true);
  error.textContent = String(message ?? '');
}

// Limpia los campos indicados y sus mensajes con el patrón err-{id}.
export function clearErrors(inputIds) {
  inputIds.forEach((id) => {
    const errorId = `err-${id}`;
    const input = document.getElementById(id);
    const error = document.getElementById(errorId);

    input?.classList.remove('is-invalid');
    input?.removeAttribute('aria-invalid');
    if (input) updateDescribedBy(input, errorId, false);
    if (error) error.textContent = '';
  });
}

const tiposToast = {
  success: { icono: 'bi bi-check-circle-fill', rol: 'status' },
  error: { icono: 'bi bi-exclamation-octagon-fill', rol: 'alert' },
  warning: { icono: 'bi bi-exclamation-triangle-fill', rol: 'status' },
  info: { icono: 'bi bi-info-circle-fill', rol: 'status' },
};

let contenedorToast;
const toastsActivos = new Map();

function obtenerContenedorToast() {
  if (contenedorToast?.isConnected) return contenedorToast;

  contenedorToast = document.createElement('div');
  contenedorToast.className = 'toast-container';
  contenedorToast.setAttribute('role', 'region');
  contenedorToast.setAttribute('aria-label', 'Notificaciones');
  document.body.append(contenedorToast);
  return contenedorToast;
}

function cerrarToast(clave, elemento, temporizador) {
  if(toastsActivos.get(clave)?.elemento!==elemento)return;
  if(temporizador!==null)clearTimeout(temporizador);
  toastsActivos.delete(clave);elemento.classList.add('toast-leaving');
  setTimeout(()=>{
    elemento.remove();
    if(contenedorToast&&!contenedorToast.children.length){contenedorToast.remove();contenedorToast=null;}
  },140);
}

// Muestra una notificación segura, deduplicada y con cierre manual o automático.
export function showToast(message, type = 'info', duration) {
  const texto = String(message ?? '').trim();
  if (!texto) return null;

  const tipo = Object.hasOwn(tiposToast, type) ? type : 'info';
  const clave = `${tipo}:${texto.toLocaleLowerCase('es-PE').replace(/\s+/g, ' ')}`;
  if(duration===undefined)duration=tipo==='error'?8000:4000;
  const tiempo = Number(duration);
  // Una duración de cero mantiene la notificación hasta que se cierre manualmente.
  const duracion = duration === 0 ? 0 : Number.isFinite(tiempo) && tiempo > 0 ? tiempo : 4000;
  const existente = toastsActivos.get(clave);

  if (existente) {
    if (existente.temporizador !== null) clearTimeout(existente.temporizador);
    existente.temporizador = duracion ? setTimeout(() => cerrarToast(clave, existente.elemento, existente.temporizador), duracion) : null;
    return existente.elemento;
  }

  const elemento = document.createElement('div');
  elemento.className = `toast-item toast-${tipo}`;
  elemento.setAttribute('role', tiposToast[tipo].rol);
  elemento.setAttribute('aria-atomic', 'true');
  elemento.setAttribute('aria-live',tipo==='error'?'assertive':'polite');

  const icono = document.createElement('i');
  icono.className = `toast-icon toast-icon-${tipo} ${tiposToast[tipo].icono}`;
  icono.setAttribute('aria-hidden', 'true');

  const mensaje = document.createElement('span');
  mensaje.className = 'toast-message';
  mensaje.textContent = texto;

  const botonCerrar = document.createElement('button');
  botonCerrar.className = 'toast-close';
  botonCerrar.type = 'button';
  botonCerrar.setAttribute('aria-label', 'Cerrar notificación');

  const iconoCerrar = document.createElement('i');
  iconoCerrar.className = 'bi bi-x-lg';
  iconoCerrar.setAttribute('aria-hidden', 'true');
  botonCerrar.append(iconoCerrar);

  elemento.append(icono, mensaje, botonCerrar);
  const registro = { elemento, temporizador: null };
  toastsActivos.set(clave, registro);
  botonCerrar.addEventListener('click', () => cerrarToast(clave, elemento, registro.temporizador));
  obtenerContenedorToast().append(elemento);

  const reanudar=()=>{if(duracion){clearTimeout(registro.temporizador);registro.temporizador=setTimeout(()=>cerrarToast(clave,elemento,registro.temporizador),duracion);}};
  elemento.addEventListener('mouseenter',()=>clearTimeout(registro.temporizador));
  elemento.addEventListener('mouseleave',reanudar);
  elemento.addEventListener('focusin',()=>clearTimeout(registro.temporizador));
  elemento.addEventListener('focusout',reanudar);
  reanudar();

  return elemento;
}

const modalTriggers = new WeakMap();

// Abre un modal de la vista y envía el foco a su primer control.
export function openOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay || overlay.classList.contains('open')) return;

  modalTriggers.set(overlay, document.activeElement);
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  const panel = overlay.querySelector('.modal-panel');
  panel?.setAttribute('role', 'dialog');
  panel?.setAttribute('aria-modal', 'true');
  panel?.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
}

// Cierra el modal y devuelve el foco al control que lo abrió.
export function closeOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  modalTriggers.get(overlay)?.focus();
  modalTriggers.delete(overlay);
}

// Una sola capa global para fotografias; no modifica el modal que la invoca.
let lightboxActivo=null;
export function closeImageLightbox(enfocar=true) { lightboxActivo?.cerrar(enfocar); }
export function openImageLightbox(url,{trigger=document.activeElement,alt='Documento del proveedor'}={}) {
  const origen=new URL(url,window.location.href);
  if(!['http:','https:','blob:'].includes(origen.protocol)||origen.origin!==window.location.origin)throw Error('La imagen debe utilizar una ruta autorizada del sistema.');
  closeImageLightbox(false);
  const expandidoAnterior=trigger?.getAttribute('aria-expanded');
  if(expandidoAnterior!==null&&expandidoAnterior!==undefined)trigger.setAttribute('aria-expanded','true');
  const capa=document.createElement('div');capa.className='image-lightbox';capa.setAttribute('role','dialog');capa.setAttribute('aria-modal','true');capa.setAttribute('aria-label','Imagen ampliada');
  capa.innerHTML='<div class="image-lightbox-frame"><div class="image-lightbox-scroll" tabindex="0" aria-label="Imagen desplazable; doble clic o rueda para ampliar"><div class="image-lightbox-canvas"><img class="image-lightbox-photo" draggable="false"></div></div><button class="image-lightbox-close" type="button" aria-label="Cerrar imagen" title="Cerrar imagen"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>';
  const marco=capa.querySelector('.image-lightbox-frame'),area=capa.querySelector('.image-lightbox-scroll'),img=capa.querySelector('img'),cerrar=capa.querySelector('button');
  let escala=1,ancho=1,alto=1,arrastre=null,cerrado=false;
  const anteriores=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>[n,n.inert]);
  anteriores.forEach(([n])=>{n.inert=true;});document.body.append(capa);document.body.classList.add('image-lightbox-open');
  function dibujar() {
    img.style.width=Math.max(1,Math.round(ancho*escala))+'px';img.style.height=Math.max(1,Math.round(alto*escala))+'px';area.classList.toggle('is-zoomed',escala>1);
  }
  function ajustar() {
    if(cerrado||!img.naturalWidth)return;
    const factor=Math.min(Math.max(1,innerWidth-32)/img.naturalWidth,Math.max(1,innerHeight-64)/img.naturalHeight,1);
    ancho=Math.max(1,Math.round(img.naturalWidth*factor));alto=Math.max(1,Math.round(img.naturalHeight*factor));escala=1;
    marco.style.width=ancho+'px';marco.style.height=alto+'px';dibujar();area.scrollTop=area.scrollLeft=0;
  }
  function ampliar(valor,evento) {
    if(!img.naturalWidth||cerrado)return;
    const rect=area.getBoundingClientRect(),x=evento?evento.clientX-rect.left:area.clientWidth/2,y=evento?evento.clientY-rect.top:area.clientHeight/2;
    const px=(area.scrollLeft+x)/(ancho*escala),py=(area.scrollTop+y)/(alto*escala);
    escala=Math.max(1,Math.min(5,valor));dibujar();area.scrollLeft=px*(ancho*escala)-x;area.scrollTop=py*(alto*escala)-y;
  }
  function salir(enfocar=true) {
    if(cerrado)return;
    cerrado=true;arrastre=null;window.removeEventListener('resize',ajustar);capa.remove();img.removeAttribute('src');
    anteriores.forEach(([n,inert])=>{n.inert=inert;});document.body.classList.remove('image-lightbox-open');lightboxActivo=null;
    if(trigger?.isConnected&&expandidoAnterior!==null&&expandidoAnterior!==undefined)trigger.setAttribute('aria-expanded',expandidoAnterior);
    if(enfocar&&trigger?.isConnected)trigger.focus();
  }
  lightboxActivo={cerrar:salir};
  img.alt=alt;img.addEventListener('load',ajustar);img.addEventListener('error',()=>{if(!cerrado){salir();showToast('No se pudo cargar la imagen.','error');}});
  cerrar.addEventListener('click',()=>salir());capa.addEventListener('click',event=>{if(event.target===capa)salir();});
  capa.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();salir();}
    if(event.key==='Tab'){event.preventDefault();(document.activeElement===cerrar?area:cerrar).focus();}
  });
  area.addEventListener('dblclick',event=>{event.preventDefault();ampliar(escala>1?1:2.5,event);});
  area.addEventListener('wheel',event=>{if(!event.deltaY)return;event.preventDefault();ampliar(escala*Math.exp(-Math.max(-120,Math.min(120,event.deltaY))*0.002),event);},{passive:false});
  area.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button===0&&escala>1){arrastre={x:event.clientX,y:event.clientY,left:area.scrollLeft,top:area.scrollTop};area.setPointerCapture(event.pointerId);}});
  area.addEventListener('pointermove',event=>{if(arrastre){area.scrollLeft=arrastre.left+arrastre.x-event.clientX;area.scrollTop=arrastre.top+arrastre.y-event.clientY;}});
  for(const tipo of ['pointerup','pointercancel','lostpointercapture'])area.addEventListener(tipo,()=>{arrastre=null;});
  window.addEventListener('resize',ajustar);img.src=origen.href;cerrar.focus();return capa;
}
