import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useUserRole() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin',
      });

      if (error) {
        console.error('Error checking role:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data);
      }
      setIsLoading(false);
    };

    checkRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isAdmin, isLoading };
}
