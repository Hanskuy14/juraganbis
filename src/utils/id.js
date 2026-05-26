// Lightweight unique ID generator. crypto.randomUUID is available in all
// modern browsers, but we fall back to a Math.random hex string just in case.

export function generateId(prefix = 'id') {
  let body;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    body = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  } else {
    body = Math.random().toString(16).slice(2, 12);
  }
  return `${prefix}_${body}`;
}
