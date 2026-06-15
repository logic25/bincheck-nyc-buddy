import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Skeleton } from '@/components/ui/skeleton';
import TeamRolesTab from '@/components/admin/TeamRolesTab';
import { Shield } from 'lucide-react';

/**
 * /admin/team - role-management surface for admins only.
 *
 * Renders <TeamRolesTab/>, which uses RLS-protected queries — even if a
 * non-admin somehow lands on this route, every mutation will be rejected
 * by Postgres. The route guard below is a UX shortcut, not the security.
 *
 * <AdminNav /> is rendered by the parent AdminLayout.
 */
const AdminTeam = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useUserRole();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, isAdmin, navigate]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-10 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="container mx-auto py-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team management</h1>
          <p className="text-sm text-muted-foreground">
            Grant analyst, sales, or admin access to BinCheckNYC staff.
          </p>
        </div>
      </div>

      <TeamRolesTab />
    </div>
  );
};

export default AdminTeam;

