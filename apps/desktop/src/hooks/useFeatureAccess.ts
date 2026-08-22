import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

/**
 * Server-decided access to the subscription-gated areas.
 *
 * The client asks rather than works it out: the same server that will refuse
 * the request decides what the page renders, so the UI and the authorisation
 * cannot disagree. This is for presentation only — every gated call re-checks,
 * and faking `allowed` here buys a nicer screen and nothing more.
 */
export type GatedFeature = 'multi_frame_generation' | 'windows_optimizer';

export interface FeatureAccess {
  status: 'loading' | 'ready' | 'error';
  allowed: boolean;
  /** Set when the check itself failed (offline, API down) — not a denial. */
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFeatureAccess(feature: GatedFeature): FeatureAccess {
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const [status, setStatus] = useState<FeatureAccess['status']>('loading');
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      // The auth guard keeps this from happening, but "no session" is a
      // definite no rather than an error worth retrying.
      setAllowed(false);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const res = await api.myFeatures();
      setAllowed(Boolean(res.features[feature]));
      setStatus('ready');
    } catch (err) {
      // Fail closed: a check that could not complete is not permission.
      setAllowed(false);
      setStatus('error');
      setError(err instanceof ApiError ? err.message : 'Could not check your subscription.');
    }
  }, [feature, user]);

  useEffect(() => {
    if (!authReady) return;
    void load();
  }, [authReady, load]);

  return { status, allowed, error, refresh: load };
}

/**
 * Ask the server to authorise a gated action immediately before running it.
 *
 * Both gated areas do their work on this machine, so the server cannot stop
 * the work itself — what it can do is refuse the go-ahead, and it re-checks
 * the entitlement here rather than trusting whatever the page last rendered.
 * Throws on refusal so callers cannot proceed by ignoring a return value.
 */
export async function authorizeFeature(feature: GatedFeature): Promise<void> {
  await api.authorizeFeature(feature);
}
