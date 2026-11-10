// Face ID backup: a passkey saved to the phone's Passwords (iCloud Keychain),
// which syncs to a new iPhone. No server involved: the passkey's user handle
// carries { code, slot }, so restoring is "Face ID → read the handle → reclaim
// that worm" with the same wh_reclaim the code flow uses. The challenge is
// random and never verified; the passkey is only a safe place to keep the way
// back in.
import { store } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const rpId = () => location.hostname;

export async function canPasskey() {
  try {
    return !!(window.PublicKeyCredential && navigator.credentials?.create
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

// Which pocket + worm a saved backup points at, so we know when to offer again.
export const backupKey = (code, slot) => (code ? `${String(code).toUpperCase()}:${slot}` : null);
export const hasBackupFor = (code, slot) => !!code && store('passkeyFor') === backupKey(code, slot);

export async function savePasskey({ code, slot, name, worm }) {
  const handle = enc.encode(JSON.stringify({ v: 1, c: String(code).toUpperCase(), s: slot }));
  if (handle.length > 64) throw new Error('too_long');
  const label = `${name || 'Me'} · ${worm || 'worm'}`;
  await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { id: rpId(), name: 'Bolsillo Worm' },
      user: { id: handle, name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      timeout: 120000,
    },
  });
  store('passkeyFor', backupKey(code, slot));
  return true;
}

// Face ID → { code, slot } of the pocket this phone's backup points at.
export async function readPasskey() {
  const cred = await navigator.credentials.get({
    publicKey: { challenge: random(32), rpId: rpId(), userVerification: 'required', timeout: 120000 },
  });
  const uh = cred?.response?.userHandle;
  if (!uh) throw new Error('no_backup');
  let d = null;
  try { d = JSON.parse(dec.decode(uh)); } catch { /* not ours */ }
  if (!d?.c || d.s == null) throw new Error('no_backup');
  return { code: d.c, slot: Number(d.s) };
}

// Restore: read the backup, then take the worm back. Returns what reclaim returns.
export async function restoreWithPasskey(backend) {
  const { code, slot } = await readPasskey();
  const r = await backend.reclaim(code, slot);
  store('passkeyFor', backupKey(code, slot));
  return r;
}

export function passkeyError(err, { restoring = false } = {}) {
  const name = err?.name || '';
  const m = String(err?.message || err);
  // iOS reports "no passkey here" and "you cancelled" the same way
  if (name === 'NotAllowedError' || name === 'AbortError') return restoring ? 'No Face ID backup used. If you never saved one, use your code.' : 'Cancelled. Nothing changed.';
  if (m.includes('no_backup')) return 'No Face ID backup found for Bolsillo Worm on this phone.';
  if (m.includes('no_such_hole')) return 'That backup points to a pocket that no longer exists. Use your code.';
  if (m.includes('no_such_worm')) return 'Your worm isn\'t in that pocket anymore. Use your code.';
  if (m.includes('already_in_hole')) return 'This phone is already in a pocket.';
  if (name === 'InvalidStateError') return 'A backup for this pocket is already saved.';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'Face ID backups don\'t work here. Open the app from your home screen.';
  return 'Couldn\'t use Face ID: ' + m.slice(0, 80);
}
