import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// app_role enum values (must match supabase migration 20260612225327).
export type AppRole = 'admin' | 'analyst' | 'sales' | 'user';

interface UserRoleState {
  isAdmin: boolean;
  isAnalyst: boolean;
  isSales: boolean;
  isStaff: boolean; // any of admin/analyst/sales
  roles: AppRole[];
  isLoading: boolean;
}

const EMPTY: UserRoleState = {
  isAdmin: false,
  isAnalyst: false,
  isSales: false,
  isStaff: false,
  roles: [],
  isLoading: true,
};

// Module-level cache so navigations between pages don't replay the loading
// skeleton on every mount. The first mount triggers the query; subsequent
// mounts (e.g. when the user clicks a nav item and a new page renders) see
// the resolved value synchronously and avoid the flicker.
let cachedState: UserRoleState | null = null;
const subscribers = new Set<(s: UserRoleState) => void>();
let inflight: Promise<void> | null = null;

const setCachedState = (next: UserRoleState) => {
  cachedState = next;
  subscribers.forEach((fn) => fn(next));
};

const loadRoles = async (): Promise<void> => {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setCachedState({ ...EMPTY, isLoading: false });
      return;
    }
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);
    if (error) {
      console.error('Error fetching roles:', error);
      setCachedState({ ...EMPTY, isLoading: false });
      return;
    }
    const roles = (data || []).map((r) => r.role as AppRole);
    const isAdmin = roles.includes('admin');
    const isAnalyst = roles.includes('analyst');
    const isSales = roles.includes('sales');
    setCachedState({
      isAdmin,
      isAnalyst,
      isSales,
      isStaff: isAdmin || isAnalyst || isSales,
      roles,
      isLoading: false,
    });
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
};

// Reset cache on auth changes (sign in / sign out / token refresh) so we
// don't serve stale roles to a different user on the same browser.
let authListenerAttached = false;
const ensureAuthListener = () => {
  if (authListenerAttached) return;
  authListenerAttached = true;
  supabase.auth.onAuthStateChange(() => {
    cachedState = null;
    void loadRoles();
  });
};

export function useUserRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>(() => cachedState ?? EMPTY);

  useEffect(() => {
    ensureAuthListener();
    subscribers.add(setState);
    if (cachedState) {
      // Make sure local state matches the latest cached value (handles
      // the case where the cache was updated between render and effect).
      setState(cachedState);
    } else {
      void loadRoles();
    }
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  return state;
}
