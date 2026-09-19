/* Auth + account + invite for RentManor (vanilla PWA, Supabase). */
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';
const INVITE_STORAGE_KEY = 'rental-home-invite-token';
const PLACEHOLDER_URL = 'YOUR_PROJECT.supabase.co';
const PLACEHOLDER_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const SAMPLE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SAMPLE_HASH = /^#?\/?sample\/?$/i;

let supabase = null;
let currentUser = null;
let currentAccount = null;
let currentMemberships = [];
let authCallback = null;
let started = false;

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
  if (message.includes('bucket') || message.includes('storage') || message.includes('payload too large') || message.includes('maximum allowed size')) {
    return 'Couldn’t save that file. Try a smaller photo or PDF, or finish the Storage setup in the README.';
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
    const next = `${location.pathname}${query ? `?${query}` : ''}`;
    history.replaceState({}, '', next);
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

let pendingAuthMode = null;

export function isSampleRoute() {
  const hash = (location.hash || '').replace(/^#/, '').replace(/^\/+|\/+$/g, '');
  return SAMPLE_HASH.test(hash);
}

export function enterSampleRoute() {
  if (!isSampleRoute()) location.hash = '/sample';
}

export function exitSampleRoute() {
  if (!isSampleRoute()) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function requestAuthMode(mode) {
  pendingAuthMode = mode === 'signup' ? 'signup' : 'signin';
}

function consumePendingAuthMode() {
  const mode = pendingAuthMode;
  pendingAuthMode = null;
  return mode;
}

export function showAuthMode(mode) {
  const signIn = document.querySelector('#signInForm');
  const signUp = document.querySelector('#signUpForm');
  if (signIn) signIn.hidden = mode !== 'signin';
  if (signUp) signUp.hidden = mode !== 'signup';
  setAuthError('');
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
}

export async function startAuth(callback) {
  if (started) return;
  started = true;
  authCallback = callback;
  captureInviteFromUrl();

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
  showAuthMode('signin');
  await refreshInviteBanner();

  let sessionJob = Promise.resolve();
  let lastNotice = '';
  const queueSession = (event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') return;
    sessionJob = sessionJob.then(() => applySession(event, session)).catch(() => {});
  };

  async function applySession(event, session) {
    if (session) {
      const needAccount = !currentUser || currentUser.id !== session.user.id || !currentAccount;
      if (needAccount && (!event || event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'hash')) {
        currentUser = session.user;
        if (!isSampleRoute()) showScreen('loading');
        try {
          const { inviteWarning } = await establishAccount(session.user);
          lastNotice = inviteWarning ? friendlyError(inviteWarning) : '';
        } catch (error) {
          if (!isSampleRoute()) {
            showScreen('auth');
            setAuthError(friendlyError(error));
            return;
          }
        }
      }
    } else {
      currentUser = null;
      currentAccount = null;
      currentMemberships = [];
    }

    if (isSampleRoute()) {
      showScreen('app');
      if (authCallback) {
        await authCallback({
          status: 'sample',
          user: currentUser,
          account: currentAccount,
          supabase
        });
      }
      return;
    }

    if (!session) {
      showAuthMode(consumePendingAuthMode() || 'signin');
      await refreshInviteBanner();
      showScreen('auth');
      await emitSignedOut();
      return;
    }

    if (event && event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'hash') return;

    showScreen('app');
    await emitSignedIn(lastNotice);
    lastNotice = '';
  }

  window.addEventListener('hashchange', () => {
    sessionJob = sessionJob.then(async () => {
      const { data } = await supabase.auth.getSession();
      await applySession('hash', data?.session || null);
    }).catch(() => {});
  });

  supabase.auth.onAuthStateChange((event, session) => {
    queueSession(event, session);
  });
}
