'use strict';

function errorMessage(error, context = 'consulta') {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  // Log the category/code only; never include records, tokens or raw SQL messages.
  console.warn('[OLT]', context, code || 'sin_codigo');
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (code === 'over_request_rate_limit' || error?.status === 429) return 'Demasiados intentos. Espera un momento y vuelve a intentar.';
  if (code === '42501') return 'Tu sesión no tiene permiso para esta operación. Vuelve a iniciar sesión.';
  if (code === '23505') return 'El registro ya existe. Revisa los duplicados antes de reintentar.';
  if (code.startsWith('22') || code === '23503' || code === '23502') return 'Los datos no son válidos para el destino. Revisa la programación antes de enviar.';
  if (code === '57014') return 'La consulta tardó demasiado. Vuelve a intentar en un momento.';
  if (code === 'PGRST202') return 'El servicio necesita actualizarse. Contacta al administrador.';
  if (message.includes('fetch') || message.includes('network') || message.includes('connection')) return 'No se pudo conectar. Comprueba tu conexión y vuelve a intentar.';
  const messages = {
    login: 'No se pudo iniciar sesión. Vuelve a intentar.',
    sesion: 'No se pudo comprobar la sesión. Vuelve a iniciar sesión.',
    excel: 'No se pudo leer el Excel. Comprueba que sea un archivo válido y no esté protegido.',
    duplicados: 'No se pudo comprobar los duplicados. Vuelve a intentar antes de enviar.',
    insercion: 'No se pudo confirmar el envío. Vuelve a revisar antes de reintentar.',
    historial: 'No se pudo consultar el historial. Vuelve a intentar.',
    logout: 'No se pudo cerrar la sesión. Vuelve a intentar.'
  };
  return messages[context] || 'No se pudo completar la consulta. Vuelve a intentar.';
}
