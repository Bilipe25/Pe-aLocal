'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const STORAGE_PREFIX = 'pedidolocal:order-sound:v1';
let audioContext: AudioContext | null = null;

function storageKey(scope: string) {
  return `${STORAGE_PREFIX}:${scope}`;
}

export function readOrderSoundPreference(storage: Pick<Storage, 'getItem'>, scope: string) {
  return storage.getItem(storageKey(scope)) === 'enabled';
}

export function writeOrderSoundPreference(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  scope: string,
  enabled: boolean,
) {
  if (enabled) storage.setItem(storageKey(scope), 'enabled');
  else storage.removeItem(storageKey(scope));
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error('Áudio não suportado.');
  audioContext = new AudioContextClass();
  return audioContext;
}

async function ensureAudioReady() {
  const context = getAudioContext();
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error('Áudio bloqueado.');
  return context;
}

function tone(context: AudioContext, frequency: number, startsAt: number, duration: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.08, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.02);
}

function playChime(context: AudioContext) {
  const now = context.currentTime;
  tone(context, 659.25, now, 0.12);
  tone(context, 880, now + 0.11, 0.17);
}

export function useOrderNotificationSound(scope: string) {
  const [memoryPreference, setMemoryPreference] = useState<{
    scope: string;
    enabled: boolean;
  } | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [soundError, setSoundError] = useState<{ scope: string; message: string } | null>(null);
  const persistedEnabled = useSyncExternalStore(
    (onChange) => {
      const storageChanged = (event: StorageEvent) => {
        if (event.key === storageKey(scope)) onChange();
      };
      window.addEventListener('storage', storageChanged);
      window.addEventListener('pedidolocal-order-sound', onChange);
      return () => {
        window.removeEventListener('storage', storageChanged);
        window.removeEventListener('pedidolocal-order-sound', onChange);
      };
    },
    () => {
      try {
        return readOrderSoundPreference(window.localStorage, scope);
      } catch {
        return false;
      }
    },
    () => false,
  );
  const enabled = memoryPreference?.scope === scope
    ? memoryPreference.enabled
    : persistedEnabled;
  const error = soundError?.scope === scope ? soundError.message : null;

  function persistPreference(nextEnabled: boolean) {
    try {
      writeOrderSoundPreference(window.localStorage, scope, nextEnabled);
      setMemoryPreference(null);
      window.dispatchEvent(new Event('pedidolocal-order-sound'));
    } catch {
      setMemoryPreference({ scope, enabled: nextEnabled });
    }
  }

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      void ensureAudioReady().then(() => setSoundError(null)).catch(() => {
        setSoundError({
          scope,
          message: 'O navegador bloqueou o som. Clique em “Som ligado” para testar novamente.',
        });
      });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled, scope]);

  async function toggle() {
    if (enabled && !error) {
      persistPreference(false);
      setSoundError(null);
      return;
    }

    setIsActivating(true);
    try {
      const context = await ensureAudioReady();
      playChime(context);
      persistPreference(true);
      setSoundError(null);
    } catch {
      persistPreference(false);
      setSoundError({ scope, message: 'Não foi possível ativar o som neste navegador.' });
    } finally {
      setIsActivating(false);
    }
  }

  async function play() {
    if (!enabled) return false;
    try {
      const context = await ensureAudioReady();
      playChime(context);
      setSoundError(null);
      return true;
    } catch {
      setSoundError({
        scope,
        message: 'O alerta sonoro foi bloqueado. Clique em “Som ligado” para testar novamente.',
      });
      return false;
    }
  }

  return { enabled, isActivating, error, toggle, play };
}
