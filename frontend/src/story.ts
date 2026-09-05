import type { RunState } from './types';

/** Shared with the retained technical drawer; presentation has four states. */
export function isInformational(run: RunState | null): boolean {
  return run?.action?.use === 'INFORMATIONAL_OUTPUT' || run?.decision?.use === 'INFORMATIONAL_OUTPUT';
}
