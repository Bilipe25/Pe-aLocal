import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrderNotificationSound } from '@/hooks/use-order-notification-sound';

describe('useOrderNotificationSound', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  it('mantém desligado e explica quando o navegador não oferece áudio', async () => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
    const { result } = renderHook(() => useOrderNotificationSound('user-a:store-a'));

    await act(async () => result.current.toggle());

    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBe('Não foi possível ativar o som neste navegador.');
  });

  it('ativa por gesto, toca a prévia e permite desligar', async () => {
    const resume = vi.fn(async () => {
      context.state = 'running';
    });
    const oscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const context = {
      state: 'suspended',
      currentTime: 0,
      destination: {},
      resume,
      createOscillator: vi.fn(() => ({ ...oscillator })),
      createGain: vi.fn(() => gain),
    };
    function MockAudioContext() {
      return context;
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: MockAudioContext,
    });
    const { result } = renderHook(() => useOrderNotificationSound('user-a:store-a'));

    await act(async () => result.current.toggle());

    expect(result.current.enabled).toBe(true);
    expect(resume).toHaveBeenCalledOnce();
    expect(context.createOscillator).toHaveBeenCalledTimes(2);

    await act(async () => result.current.toggle());
    expect(result.current.enabled).toBe(false);
  });
});
