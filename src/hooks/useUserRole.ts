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

export function useUserRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>({
    isAdmin: false,
    isAnalyst: false,
    isSales: false,
    isStaff: false,
    roles: [],
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    const checkRoles = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (isMounted) {
          setState({
            isAdmin: false,
            isAnalyst: false,
            isSales: false,
            isStaff: false,
            roles: [],
            isLoading: false,
          });
        }
        return;
      }

      // Query user_roles directly. Users can SELECT their own rows (RLS policy
      // from migration 20260219090802); admins can also see all rows, which is
      // fine here - we only care about the current user's roles.
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);

      if (!isMounted) return;

      if (error) {
        console.error('Error fetching roles:', error);
        setState({
          isAdmin: false,
          isAnalyst: false,
          isSales: false,
          isStaff: false,
          roles: [],
          isLoading: false,
        });
        return;
      }

      const roles = (data || []).map((r) => r.role as AppRole);
      const isAdmin = roles.includes('admin');
      const isAnalyst = roles.includes('analyst');
      const isSales = roles.includes('sales');

      setState({
        isAdmin,
        isAnalyst,
        isSales,
        isStaff: isAdmin || isAnalyst || isSales,
        roles,
        isLoading: false,
      });
    };

    checkRoles();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkRoles();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
