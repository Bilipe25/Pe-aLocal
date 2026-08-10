import { createHash, createHmac } from 'node:crypto';

const PUSHER_REQUEST_TIMEOUT_MS = 5_000;
const CHANNEL_PATTERN = /^[A-Za-z0-9_=@,.;\-]+$/;

export interface PusherHttpClient {
  trigger(channels: string | string[], eventName: string, data: unknown): Promise<void>;
}

export interface PusherHttpClientConfig {
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  timeoutMs?: number;
}

function validateTrigger(channels: string[], eventName: string) {
  if (channels.length === 0 || channels.length > 100) {
    throw new Error('Pusher channel count is invalid.');
  }
  if (!eventName || eventName.length > 200) throw new Error('Pusher event name is invalid.');
  if (
    channels.some((channel) => !channel || channel.length > 200 || !CHANNEL_PATTERN.test(channel))
  ) {
    throw new Error('Pusher channel name is invalid.');
  }
}

export function createPusherHttpClient(config: PusherHttpClientConfig): PusherHttpClient {
  const request = config.fetch ?? globalThis.fetch;
  const now = config.now ?? Date.now;
  const timeoutMs = config.timeoutMs ?? PUSHER_REQUEST_TIMEOUT_MS;

  return {
    async trigger(inputChannels, eventName, data) {
      const channels = Array.isArray(inputChannels) ? inputChannels : [inputChannels];
      validateTrigger(channels, eventName);

      const body = JSON.stringify({
        name: eventName,
        channels,
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
      const path = `/apps/${encodeURIComponent(config.appId)}/events`;
      const params = new URLSearchParams({
        auth_key: config.key,
        auth_timestamp: String(Math.floor(now() / 1_000)),
        auth_version: '1.0',
        body_md5: createHash('md5').update(body, 'utf8').digest('hex'),
      });
      params.sort();
      const stringToSign = `POST\n${path}\n${params.toString()}`;
      params.set(
        'auth_signature',
        createHmac('sha256', config.secret).update(stringToSign, 'utf8').digest('hex'),
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(
          `https://api-${config.cluster}.pusher.com${path}?${params.toString()}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Pusher-Library': 'pedidolocal-workers',
            },
            body,
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`Pusher request failed with status ${response.status}.`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Pusher request timed out.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
