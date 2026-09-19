/* Auth + account + invite for RentManor (vanilla PWA, Supabase). */
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';
const INVITE_STORAGE_KEY = 'rental-home-invite-token';
const PLACEHOLDER_URL = 'YOUR_PROJECT.supabase.co';
const PLACEHOLDER_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabase = null;
let currentUser = null;
let currentAccount = null;
let currentMemberships = [];
let authCallback = null;
let started = false;
let recoveryPending = false;

export function hasSupabaseConfig() {
  const config = window.RENTAL_HOME_CONFIG || {};
  const url = String(config.supabaseUrl || '').trim();
  const key = String(config.supabaseAnonKey || '').trim();
  if (!url || !key) return false;
  if (url.includes(PLACEHOLDER_URL) || key.includes(PLACEHOLDER_KEY) || key === 'your-anon-key') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  } catch (_) {
    return false;
  }
}

export function getSupabase() {
  return supabase;
}

export function getUser() {
  return currentUser;
}

export function getAccount() {
  return currentAccount;
}

export function isOwner() {
  return currentAccount?.role === 'owner';
}

export function getInviteToken() {
  return (sessionStorage.getItem(INVITE_STORAGE_KEY) || '').trim();
}

export function clearInviteToken() {
  sessionStorage.removeItem(INVITE_STORAGE_KEY);
}

export function friendlyError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('configure') || message.includes('config.js')) return String(error.message || error);
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'That email or password doesn’t match.';
  }
  if (message.includes('already registered') || message.includes('already been registered') || message.includes('user already exists')) {
    return 'That email already has an account. Try signing in.';
  }
  if (message.includes('password') && (message.includes('6') || message.includes('least') || message.includes('weak') || message.includes('short'))) {
    return 'Please use a password with at least 6 characters.';
  }
  if (message.includes('email not confirmed') || message.includes('confirm')) {
    return 'Please check your email to finish creating your account, then sign in.';
  }
  if (message.includes('rate') || message.includes('too many') || message.includes('over_email')) {
    return 'Please wait a minute, then try again.';
  }
  if (message.includes('same password') || message.includes('should be different') || message.includes('different from the old')) {
    return 'Please choose a password you haven’t used.';
  }
  if (message.includes('valid email') || message.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('invite was created for a different email')) {
    return 'This invite was made for a different email address.';
  }
  if (message.includes('invite has expired')) return 'That invite has expired. Ask them to send a new one.';
  if (message.includes('invite code was not found') || message.includes('missing invite')) {
    return 'That invite code was not found.';
  }
  if (message.includes('only the account owner')) {
    return 'Only the account owner can invite someone.';
  }
  if (message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find the function') || message.includes('could not find the table')) {
    return 'This project isn’t finished setting up. Paste supabase/schema.sql into the Supabase SQL editor, then try again.';
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) {
    return 'Could not connect. Check your internet and try again.';
  }
  if (message.includes('not allowed') || message.includes('row-level security') || message.includes('rls')) {
    return 'You don’t have access to that.';
  }
  return 'Something went wrong. Please try again.';
}

function captureInviteFromUrl() {
  const params = new URLSearchParams(location.search);
  let token = (params.get('invite') || '').trim();
  if (!token && location.hash) {
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    token = (hashParams.get('invite') || '').trim();
  }
  if (token) {
    sessionStorage.setItem(INVITE_STORAGE_KEY, token.toUpperCase());
    params.delete('invite');
    const query = params.toString();
    let hash = location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      if (hashParams.has('invite')) {
        hashParams.delete('invite');
        const leftover = hashParams.toString();
        hash = leftover ? `#${leftover}` : '';
      }
    }
    history.replaceState({}, '', `${location.pathname}${query ? `?${query}` : ''}${hash}`);
  }
}

function showEl(id, visible) {
  const node = document.querySelector(id);
  if (node) node.hidden = !visible;
}

function setAuthError(message) {
  document.querySelectorAll('.js-auth-error').forEach(box => {
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = message;
  });
}

function setAuthSuccess(message) {
  document.querySelectorAll('.js-auth-success').forEach(box => {
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = message;
  });
}

function isRecoveryHash() {
  const blob = `${location.hash || ''}${location.search || ''}`;
  return /type=recovery/i.test(blob);
}

function isAuthCallbackHash() {
  const hash = location.hash || '';
  return /access_token=|refresh_token=/i.test(hash);
}

export function appOriginUrl() {
  const dir = location.pathname.replace(/index\.html$/i, '');
  const withSlash = dir.endsWith('/') ? dir : `${dir}/`;
  return `${location.origin}${withSlash}`;
}

function requestedAuthMode() {
  if (isRecoveryHash()) return 'recovery';
  if (isAuthCallbackHash()) return 'signin';
  const params = new URLSearchParams(location.search);
  const queryMode = (params.get('mode') || '').toLowerCase();
  const rawHash = (location.hash || '').replace(/^#/, '').toLowerCase();
  const hashHead = rawHash.split('&')[0].split('=')[0];
  const hashParams = new URLSearchParams(rawHash.includes('=') ? rawHash : '');
  const hashMode = (hashParams.get('mode') || hashHead || '').toLowerCase();
  const mode = queryMode || hashMode;
  if (mode === 'signup' || mode === 'sign-up') return 'signup';
  if (mode === 'forgot' || mode === 'reset') return 'forgot';
  if (mode === 'recovery') return 'recovery';
  return 'signin';
}

function syncAuthHash(mode) {
  if (isAuthCallbackHash() || isRecoveryHash()) return;
  if (mode !== 'signup' && mode !== 'signin' && mode !== 'forgot') return;
  const next = `#${mode}`;
  if (location.hash.toLowerCase() === next) return;
  history.replaceState({}, '', `${location.pathname}${location.search}${next}`);
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = Boolean(busy);
  if (label) button.textContent = label;
}

export function showScreen(name) {
  showEl('#loadingView', name === 'loading');
  showEl('#setupView', name === 'setup');
  showEl('#authView', name === 'auth');
  showEl('#signedInApp', name === 'app');
}

function showAuthMode(mode) {
  const forms = {
    signin: '#signInForm',
    signup: '#signUpForm',
    forgot: '#forgotForm',
    recovery: '#recoveryForm'
  };
  Object.entries(forms).forEach(([key, selector]) => {
    const node = document.querySelector(selector);
    if (node) node.hidden = key !== mode;
  });
  setAuthError('');
  if (mode !== 'forgot') setAuthSuccess('');
  syncAuthHash(mode);
}

async function refreshInviteBanner() {
  const banner = document.querySelector('#inviteBanner');
  const text = document.querySelector('#inviteBannerText');
  const token = getInviteToken();
  if (!banner) return;
  if (!token || !supabase) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  if (text) text.textContent = 'You have an invite to share a rental account. Create an account or sign in to join.';
  try {
    const data = await rpc('lookup_invite', { invite_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    if (row.status === 'valid' && text) {
      text.textContent = `You’ve been invited to share “${row.account_name}”. Create an account or sign in to see the same homes.`;
    } else if (row.status === 'expired' && text) {
      text.textContent = 'That invite has expired. Ask them to send a new one.';
    } else if (row.status === 'accepted' && text) {
      text.textContent = 'This invite was already used. Sign in with the email that joined.';
    }
  } catch (_) { /* keep the generic banner */ }
}

async function createSupabaseClient() {
  const config = window.RENTAL_HOME_CONFIG;
  const { createClient } = await import(SUPABASE_JS);
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

async function loadMemberships(user) {
  const { data, error } = await supabase
    .from('account_members')
    .select('account_id, role, email, created_at, accounts ( id, name, seeded, created_at )')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function pickAccount(memberships, preferredId) {
  if (!memberships.length) return null;
  if (preferredId) {
    const match = memberships.find(row => row.account_id === preferredId);
    if (match) return match;
  }
  return memberships.find(row => row.role === 'owner') || memberships[0];
}

function toAccount(row) {
  if (!row) return null;
  return {
    id: row.accounts?.id || row.account_id,
    name: row.accounts?.name || 'Your account',
    seeded: Boolean(row.accounts?.seeded),
    role: row.role
  };
}

async function acceptStoredInvite() {
  const token = getInviteToken();
  if (!token) return null;
  const data = await rpc('accept_invite', { invite_token: token });
  clearInviteToken();
  return data;
}

async function establishAccount(user) {
  const warnings = [];
  let inviteWarning = null;
  try {
    await rpc('ensure_my_account');
  } catch (error) {
    warnings.push(error);
  }

  let preferredId = null;
  if (getInviteToken()) {
    try {
      preferredId = await acceptStoredInvite();
    } catch (error) {
      const message = String(error?.message || '');
      if (/not found|expired|different email/i.test(message)) clearInviteToken();
      inviteWarning = error;
    }
  }

  let memberships = [];
  try {
    memberships = await loadMemberships(user);
  } catch (error) {
    warnings.push(error);
  }
  if (!memberships.length) {
    try {
      await rpc('ensure_my_account');
      memberships = await loadMemberships(user);
    } catch (error) {
      warnings.push(error);
    }
  }

  currentMemberships = memberships;
  currentAccount = toAccount(pickAccount(memberships, preferredId));
  if (!currentAccount) throw (warnings[0] || new Error('Could not open your account.'));
  return { inviteWarning };
}

async function emitSignedIn(notice) {
  if (!authCallback) return;
  await authCallback({
    status: 'signed-in',
    user: currentUser,
    account: currentAccount,
    supabase,
    notice
  });
}

async function emitSignedOut() {
  currentUser = null;
  currentAccount = null;
  currentMemberships = [];
  if (!authCallback) return;
  await authCallback({ status: 'signed-out' });
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, accountName) {
  const token = getInviteToken();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        account_name: accountName || 'My rentals',
        invite_token: token || ''
      }
    }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: appOriginUrl()
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function createInvite(email) {
  if (!currentAccount?.id) throw new Error('Not signed in');
  const data = await rpc('create_invite', {
    target_account: currentAccount.id,
    invite_email: email ? email.trim().toLowerCase() : null
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) throw new Error('Could not create an invite.');
  return row;
}

export function inviteUrl(token) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('invite', token);
  return url.toString();
}

export async function listMembers() {
  if (!currentAccount?.id) return [];
  const { data, error } = await supabase
    .from('account_members')
    .select('user_id, role, email, created_at')
    .eq('account_id', currentAccount.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function markAccountSeeded() {
  if (!currentAccount?.id) return;
  await rpc('mark_account_seeded', { target_account: currentAccount.id });
  currentAccount.seeded = true;
}

export async function replaceAccountProperties(rows) {
  if (!currentAccount?.id) throw new Error('Not signed in');
  await rpc('replace_account_properties', {
    target_account: currentAccount.id,
    payload: rows
  });
}

function bindAuthForms() {
  document.querySelector('#showSignUp')?.addEventListener('click', event => {
    event.preventDefault();
    showAuthMode('signup');
  });
  document.querySelector('#showSignIn')?.addEventListener('click', event => {
    event.preventDefault();
    showAuthMode('signin');
  });
  document.querySelector('#showSignInFromForgot')?.addEventListener('click', event => {
    event.preventDefault();
    showAuthMode('signin');
  });
  document.querySelector('#showForgot')?.addEventListener('click', event => {
    event.preventDefault();
    const fromSignIn = document.querySelector('#signInForm input[name="email"]')?.value || '';
    const forgotEmail = document.querySelector('#forgotForm input[name="email"]');
    if (forgotEmail && fromSignIn && !forgotEmail.value) forgotEmail.value = fromSignIn;
    showAuthMode('forgot');
  });
  document.querySelector('#cancelRecovery')?.addEventListener('click', async event => {
    event.preventDefault();
    recoveryPending = false;
    await signOut();
  });

  window.addEventListener('hashchange', () => {
    if (recoveryPending || isRecoveryHash() || isAuthCallbackHash()) return;
    if (document.querySelector('#authView')?.hidden) return;
    showAuthMode(requestedAuthMode());
  });

  document.querySelector('#signInForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }
    setAuthError('');
    setBusy(submit, true, 'Signing in…');
    try {
      await signIn(email, password);
    } catch (error) {
      setAuthError(friendlyError(error));
    } finally {
      setBusy(submit, false, 'Sign in');
    }
  });

  document.querySelector('#signUpForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;
    const accountName = form.accountName.value.trim();
    if (!email || !password) {
      setAuthError('Please enter an email and password.');
      return;
    }
    if (password !== confirm) {
      setAuthError('Those passwords don’t match.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Please use a password with at least 6 characters.');
      return;
    }
    setAuthError('');
    setBusy(submit, true, 'Creating account…');
    try {
      const data = await signUp(email, password, accountName);
      if (data?.user && !data.session) {
        showAuthMode('signin');
        setAuthError('Check your email to finish creating your account, then sign in here.');
      }
    } catch (error) {
      setAuthError(friendlyError(error));
    } finally {
      setBusy(submit, false, 'Create account');
    }
  });

  document.querySelector('#forgotForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const email = form.email.value.trim();
    if (!email) {
      setAuthError('Please enter your email.');
      return;
    }
    setAuthError('');
    setAuthSuccess('');
    setBusy(submit, true, 'Sending…');
    try {
      await requestPasswordReset(email);
      setAuthSuccess('Check your email for a link to reset your password.');
    } catch (error) {
      setAuthError(friendlyError(error));
    } finally {
      setBusy(submit, false, 'Send reset link');
    }
  });

  document.querySelector('#recoveryForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const password = form.password.value;
    const confirm = form.confirm.value;
    if (!password) {
      setAuthError('Please enter a new password.');
      return;
    }
    if (password !== confirm) {
      setAuthError('Those passwords don’t match.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Please use a password with at least 6 characters.');
      return;
    }
    setAuthError('');
    setBusy(submit, true, 'Saving…');
    try {
      await updatePassword(password);
      recoveryPending = false;
      history.replaceState({}, '', `${location.pathname}${location.search}`);
      currentUser = (await supabase.auth.getSession()).data.session?.user || currentUser;
      if (!currentUser) {
        showAuthMode('signin');
        setAuthSuccess('');
        setAuthError('Your password is updated. Sign in with the new one.');
        return;
      }
      showScreen('loading');
      const { inviteWarning } = await establishAccount(currentUser);
      showScreen('app');
      await emitSignedIn(inviteWarning ? friendlyError(inviteWarning) : 'Your password is updated.');
    } catch (error) {
      setAuthError(friendlyError(error));
    } finally {
      setBusy(submit, false, 'Save new password');
    }
  });
}

export async function startAuth(callback) {
  if (started) return;
  started = true;
  authCallback = callback;
  captureInviteFromUrl();
  recoveryPending = isRecoveryHash();

  if (!hasSupabaseConfig()) {
    showScreen('setup');
    await callback({ status: 'need-config' });
    return;
  }

  try {
    supabase = await createSupabaseClient();
  } catch (error) {
    showScreen('setup');
    const detail = document.querySelector('#setupDetail');
    if (detail) {
      detail.textContent = 'Could not load sign-in. Check your internet, then reload. If this is a new copy of the app, confirm config.js has your project URL and anon key.';
    }
    await callback({ status: 'need-config', error });
    return;
  }

  bindAuthForms();
  recoveryPending = recoveryPending || isRecoveryHash();
  showAuthMode(recoveryPending ? 'recovery' : requestedAuthMode());
  await refreshInviteBanner();

  let sessionJob = Promise.resolve();
  const queueSession = (event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
    if (event === 'PASSWORD_RECOVERY') recoveryPending = true;
    sessionJob = sessionJob.then(() => applySession(event, session)).catch(() => {});
  };

  async function applySession(event, session) {
    if (!session) {
      currentUser = null;
      currentAccount = null;
      recoveryPending = false;
      const mode = event === 'SIGNED_OUT' ? 'signin' : requestedAuthMode();
      showAuthMode(mode === 'recovery' ? 'signin' : mode);
      await refreshInviteBanner();
      showScreen('auth');
      await emitSignedOut();
      return;
    }
    if (event === 'PASSWORD_RECOVERY' || recoveryPending || isRecoveryHash()) {
      recoveryPending = true;
      currentUser = session.user;
      showAuthMode('recovery');
      showScreen('auth');
      return;
    }
    if (event && event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return;
    if (currentUser?.id === session.user.id && currentAccount) return;
    currentUser = session.user;
    showScreen('loading');
    try {
      const { inviteWarning } = await establishAccount(session.user);
      showScreen('app');
      await emitSignedIn(inviteWarning ? friendlyError(inviteWarning) : '');
    } catch (error) {
      showScreen('auth');
      setAuthError(friendlyError(error));
    }
  }

  supabase.auth.onAuthStateChange((event, session) => {
    queueSession(event, session);
  });
}
