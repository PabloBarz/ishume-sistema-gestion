export const fallo=(mensaje,status=400)=>Object.assign(new Error(mensaje),{status});
export const esOrdenMasiva=c=>/^(?:OC-MAS-[0-9]+|ORDEN-MAS-[A-Z0-9]+-[0-9]+)$/.test(c||'');
export function importeCentimos(valor,cero=false) {
  if(typeof valor!=='string'||!/^\d{1,10}(?:\.\d{1,2})?$/.test(valor))throw fallo('Importe inválido: utiliza hasta dos decimales.');
  const [a,b='']=valor.split('.'),n=Number(a)*100+Number(b.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n>999999999999||n< (cero?0:1))throw fallo('El importe debe ser positivo y estar dentro del límite permitido.');
  return n;
}
export const decimal=n=>(n/100).toFixed(2);
export function fechaValida(valor,opcional=false) {
  if(opcional&&(valor===null||valor===''))return null;
  if(typeof valor!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(valor)||valor<'1000-01-01')throw fallo('Fecha inválida.');
  const d=new Date(valor+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==valor)throw fallo('Fecha inválida.');
  return valor;
}
export function validarCorreccionAbono(p){
  if(!p||typeof p!=='object'||Array.isArray(p))throw fallo('Datos de corrección inválidos.');
  const a=validarAbono(p,999999999999),fecha=fechaValida(p.fecha_pago);
  if(typeof p.motivo!=='string'||!p.motivo.trim()||p.motivo.trim().length>500)throw fallo('Indica el motivo de la corrección (máximo 500 caracteres).');
  if(!Number.isSafeInteger(p.version_esperada)||p.version_esperada<0)throw fallo('Versión del abono inválida.');
  return {monto:a.monto,metodo:a.metodo,fecha,motivo:p.motivo.trim(),version:p.version_esperada};
}
export function validarAbono(p,saldo) {
  const monto=importeCentimos(p.monto);
  if(monto>saldo)throw fallo('El abono no puede superar el saldo pendiente.',409);
  if(!['Yape','Transferencia'].includes(p.metodo_pago))throw fallo('Selecciona un método de pago válido.');
  const operacion=p.numero_operacion??'';
  if(typeof operacion!=='string'||operacion.length>100)throw fallo('Número de operación inválido.');
  return {monto,metodo:p.metodo_pago,operacion:operacion.trim()||null};
}
export function claveValida(clave) {
  if(typeof clave!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(clave))throw fallo('La operación no tiene una clave válida.');
  return clave;
}
