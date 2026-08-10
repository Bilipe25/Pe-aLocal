export function isWebPushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.WEB_PUSH_ENABLED) === 'true';
}

export function getPublicVapidKey(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isWebPushEnabled(env)) return null;
  const key = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return key && /^[A-Za-z0-9_-]{80,100}$/.test(key) ? key : null;
}
