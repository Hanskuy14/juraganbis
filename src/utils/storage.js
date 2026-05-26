// Thin wrapper around localStorage with safe JSON serialization.
// All persistent game state lives under a single key so saves are atomic.

const STORAGE_KEY = 'rajaPantura.save.v1';

export function loadSave() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    console.warn('[rajaPantura] gagal membaca save:', err);
    return null;
  }
}

export function writeSave(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[rajaPantura] gagal menyimpan save:', err);
  }
}

export function clearSave() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[rajaPantura] gagal menghapus save:', err);
  }
}

export function hasSave() {
  return Boolean(loadSave());
}
