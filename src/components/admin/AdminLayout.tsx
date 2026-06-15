import { Navigate, Outlet } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';
import AdminNav from './AdminNav';

/**
 * Persistent shell for staff-only routes (/admin/*, /dd-reports).
 *
 * Owns the role gate AND the <AdminNav /> render so the nav stays mounted
 * across navigations between staff pages — clicking a nav item only swaps
 * the inner <Outlet /> content, no full-page skeleton wipe / nav flash.
 *
 * Non-staff users are redirected to /dashboard.
 */
const AdminLayout = () => {
  const { isStaff, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <AdminNav />
      <Outlet />
    </>
  );
};

export default AdminLayout;
