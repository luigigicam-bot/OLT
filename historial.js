async function cargarUltimoEnvioUsuario(userId) {
  const { data, error } = await supabaseClient
    .from('recepcion_olt')
    .select('created_at')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at || null;
}

async function cargarUltimoEnvioArchivo(userId) {
  if (!fileHash || !$('sheet').value) return null;
  const { data, error } = await supabaseClient
    .from('recepcion_olt')
    .select('created_at')
    .eq('usuario_id', userId)
    .eq('archivo_hash', fileHash)
    .eq('pestana', $('sheet').value)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at || null;
}

window.refreshOLTFileHistory = async function () {
  const version = ++historyVersion;
  const user = oltSession?.user;

  if (!user) {
    $('lastUserUpload').textContent = 'Inicia sesión para consultar tus envíos.';
    $('lastFileUpload').textContent = 'Inicia sesión para consultar el historial de este archivo.';
    return;
  }

  if (fileHash && $('sheet').value) {
    $('lastFileUpload').textContent = 'Consultando historial…';
  }

  try {
    const [ultimoUsuario, ultimoArchivo] = await Promise.all([
      cargarUltimoEnvioUsuario(user.id),
      cargarUltimoEnvioArchivo(user.id)
    ]);

    if (version !== historyVersion) return;

    $('lastUserUpload').textContent =
      'Último envío del usuario: ' + displayLast(ultimoUsuario);

    $('lastFileUpload').textContent = fileHash && $('sheet').value
      ? 'Último envío de este archivo y pestaña: ' + displayLast(ultimoArchivo)
      : 'Selecciona un archivo y una pestaña para consultar su último envío.';
    await cargarDashboardEHistorial(version);
  } catch (error) {
    if (version !== historyVersion) return;
    $('lastFileUpload').textContent = errorMessage(error, 'historial');
    $('historyEmpty').textContent = 'No se pudo actualizar el historial. Vuelve a intentar.';
    $('historyEmpty').hidden = false;
    $('dashboardScope').textContent = 'No se pudo actualizar';
  }
};

