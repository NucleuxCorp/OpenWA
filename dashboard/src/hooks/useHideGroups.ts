import { useState, useCallback } from 'react';

const HIDE_GROUPS_KEY = 'openwa_hide_groups';

/**
 * Whether the chat list hides group conversations, remembered per browser like the theme.
 *
 * Defaults to showing everything. A filter the operator did not ask for is worse than the noise
 * it removes, because a hidden chat is indistinguishable from one that never arrived.
 *
 * The storage calls are guarded: a browser with site data blocked throws on access, and the chat
 * list has to render anyway. Failing to remember the preference is acceptable; failing to draw
 * the page is not.
 */
export function useHideGroups() {
  const [hideGroups, setHideGroupsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_GROUPS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setHideGroups = useCallback((value: boolean) => {
    setHideGroupsState(value);
    try {
      localStorage.setItem(HIDE_GROUPS_KEY, String(value));
    } catch {
      // Storage refused; the toggle still applies for this session.
    }
  }, []);

  return { hideGroups, setHideGroups };
}
