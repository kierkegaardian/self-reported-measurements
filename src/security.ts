export class InputError extends Error {}
export function credentials(body: Record<string, unknown>) {
  if (typeof body.handle !== 'string') throw new InputError('Handle is required.');
  const handle = body.handle.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new InputError('Invalid handle.');
  return { handle };
}
export function measurements(body: Record<string, unknown>) {
  if (body.adult !== true || body.own !== true) throw new InputError('Confirm you are 18+ and submitting for yourself.');
  if (body.unit !== 'in' && body.unit !== 'cm') throw new InputError('Invalid unit.');
  const factor = body.unit === 'cm' ? 2.54 : 1;
  for (const [field, max] of [['length', 9.5], ['girth', 7]] as const) {
    const n = body[field];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < Math.round(factor * 10) / 10 || n > Math.round(max * factor * 10) / 10)
      throw new InputError(`Invalid ${field}.`);
  }
  return { length: Math.round((body.length as number) * 10) / 10,
    girth: Math.round((body.girth as number) * 10) / 10, unit: body.unit };
}
export function optionalDetails(body: Record<string, unknown>) {
  const circumcision = body.circumcision ?? null;
  if (circumcision !== null && (typeof circumcision !== 'string' || !['circumcised', 'uncircumcised', 'partial'].includes(circumcision)))
    throw new InputError('Invalid circumcision status.');
  const factor = body.unit === 'cm' ? 2.54 : 1;
  function measure(field: string, max: number): number | null {
    const n = body[field];
    if (n === undefined || n === null) return null;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0.1 || n > Math.round(max * factor * 10) / 10)
      throw new InputError(`Invalid ${field}.`);
    return Math.round(n * 10) / 10;
  }
  return { circumcision: circumcision as string | null,
    flaccidLength: measure('flaccidLength', 9.5), flaccidGirth: measure('flaccidGirth', 7) };
}
export async function verifier(passphrase: string, salt: string): Promise<string> {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + passphrase));
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
export function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
