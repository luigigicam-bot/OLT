function sessionUserLabel(session = oltSession) {
  return session?.user?.email || session?.user?.phone || 'Usuario autenticado';
}

function mostrarPuertaAcceso(message = '') {
  $('appShell').hidden = true;
  $('authGate').hidden = false;
  $('authGate').classList.remove('auth-loading');
  $('gateLoginError').textContent = message || '';
  $('gatePassword').value = '';
  setTimeout(() => $('gateUsername').focus(), 0);
}

function mostrarAplicacion() {
  $('authGate').hidden = true;
  $('appShell').hidden = false;
  $('gateLoginError').textContent = '';
  $('gatePassword').value = '';
}

function aplicarSesion(session) {
  oltSession = session || null;

  if (!oltSession?.user) {
    $('currentUser').textContent = 'Sin sesión iniciada';
    $('lastUserUpload').textContent = 'Inicia sesión para consultar tus envíos.';
    $('lastFileUpload').textContent = 'Carga un archivo e inicia sesión para consultar su último envío.';
    $('loginOpen').hidden = false;
    $('logout').hidden = true;
    $('refreshHistory').disabled = true;
    $('insightsPanel').hidden = true;
    $('historyBody').replaceChildren();
    for (const id of ['dashRecords','dashFiles','dashLima','dashProvincia']) $(id).textContent = '0';
    pendingSendReview = null;
    duplicateState('se comprobarán antes de enviar. Coincidencia 100% en las 19 columnas = registro omitido.');
    mostrarPuertaAcceso();
    return;
  }

  mostrarAplicacion();
  $('currentUser').textContent = 'Usuario: ' + sessionUserLabel();
  $('loginOpen').hidden = true;
  $('logout').hidden = false;
  $('refreshHistory').disabled = false;
  $('insightsPanel').hidden = false;
}

async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || '')
  });
  if (error) throw error;
  if (!data.session?.user) throw new Error('Supabase no devolvió una sesión válida.');
  aplicarSesion(data.session);
  await window.refreshOLTFileHistory();
}

$('gateLoginForm').onsubmit = async e => {
  e.preventDefault();
  $('gateLoginSubmit').disabled = true;
  $('gateLoginError').textContent = '';
  $('authGate').classList.add('auth-loading');

  try {
    await signIn($('gateUsername').value, $('gatePassword').value);
  } catch (error) {
    mostrarPuertaAcceso(
      errorMessage(error, 'login')
    );
  } finally {
    $('gatePassword').value = '';
    $('gateLoginSubmit').disabled = false;
    $('authGate').classList.remove('auth-loading');
  }
};

$('loginOpen').onclick = () => {
  $('loginError').textContent = '';
  $('login').showModal();
};

$('cancelLogin').onclick = () => {
  $('password').value = '';
  $('login').close();
};

$('login').addEventListener('close', () => {
  $('password').value = '';
});

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  $('loginSubmit').disabled = true;
  $('loginError').textContent = '';

  try {
    await signIn($('username').value, $('password').value);
    $('login').close();
  } catch (error) {
    $('loginError').textContent =
      errorMessage(error, 'login');
  } finally {
    $('password').value = '';
    $('loginSubmit').disabled = false;
  }
};

$('refreshHistory').onclick = () => window.refreshOLTFileHistory();

$('logout').onclick = async () => {
  if (sending) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    notice(errorMessage(error, 'logout'), true);
    return;
  }
  historyVersion++;
  aplicarSesion(null);
};

async function iniciarAplicacion() {
  mostrarPuertaAcceso();
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    aplicarSesion(data.session);
    if (data.session?.user) await window.refreshOLTFileHistory();
  } catch (error) {
    aplicarSesion(null);
    $('gateLoginError').textContent = errorMessage(error, 'sesion');
  }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    oltSession = session;
    if (!$('appShell').hidden) {
      $('currentUser').textContent = 'Usuario: ' + sessionUserLabel(session);
    }
  } else if (oltSession) {
    historyVersion++;
    aplicarSesion(null);
  }
});

iniciarAplicacion();
