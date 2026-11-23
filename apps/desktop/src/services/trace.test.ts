import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPinPrompt, trace, TraceError } from '@/services/trace';

const locked = { ok: false, error: { code: 'E_LOCKED', message: 'Enter your Trace PIN to pause recording.' } };
const paused = { ok: true, result: { trackingEnabled: false } };

function bridgeAnswering(...responses: unknown[]) {
  const request = vi.fn();
  for (const response of responses) {
    request.mockResolvedValueOnce(response);
  }

  (window as unknown as { trace: unknown }).trace = { request };
  return request;
}

describe('a guarded request', () => {
  afterEach(() => setPinPrompt(null));

  it('asks for the PIN with the tracker message and sends the request again once unlocked', async () => {
    const request = bridgeAnswering(locked, paused);
    const prompt = vi.fn().mockResolvedValue(true);
    setPinPrompt(prompt);

    await expect(trace.pause()).resolves.toEqual({ trackingEnabled: false });
    expect(prompt).toHaveBeenCalledWith('Enter your Trace PIN to pause recording.');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenNthCalledWith(2, 'tracking.pause', undefined);
  });

  it('fails as locked, without retrying, when the PIN window is cancelled', async () => {
    const request = bridgeAnswering(locked);
    setPinPrompt(vi.fn().mockResolvedValue(false));

    await expect(trace.pause()).rejects.toMatchObject({ code: 'E_LOCKED' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('never prompts for the calls that check the PIN themselves', async () => {
    bridgeAnswering({ ok: false, error: { code: 'E_LOCKED', message: 'That PIN is not right.' } });
    const prompt = vi.fn();
    setPinPrompt(prompt);

    await expect(trace.unlock('1111')).rejects.toBeInstanceOf(TraceError);
    expect(prompt).not.toHaveBeenCalled();
  });
});
