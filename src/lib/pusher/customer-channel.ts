export async function privateCustomerOrderChannel(publicToken: string) {
  const bytes = new TextEncoder().encode(publicToken);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `private-order-${hash}`;
}
