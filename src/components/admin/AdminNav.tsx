import { NavLink, useLocation } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import {
  Shield, Users, FileText, ScrollText, LayoutDashboard, Mail,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Persistent secondary nav for the admin/staff surfaces.
 *
 * Visibility rules:
 *   - Renders nothing for clients (non-staff). We rely on RLS for true
 *     access control; this just hides the chrome.
 *   - Items are gated by role using `useUserRole`:
 *       * /admin/team     -> admin only
 *       * /admin/documents-> admin + analyst (staff workflow)
 *       * /admin/audit    -> admin only
 *   - Sales role currently has no admin surfaces; this nav will collapse
 *     to just the dashboard link for them.
 *
 * Layout: horizontal pill bar that sits below the page header. Mobile-safe
 * via overflow-x-auto.
 */

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Role predicate. Receives the useUserRole() snapshot. */
  visible: (r: ReturnType<typeof useUserRole>) => boolean;
};

const ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    visible: (r) => !!r.isStaff,
  },
  {
    to: '/admin/documents',
    label: 'Documents',
    icon: FileText,
    visible: (r) => !!r.isAdmin || !!r.isAnalyst,
  },
  {
    to: '/admin/team',
    label: 'Team',
    icon: Users,
    visible: (r) => !!r.isAdmin,
  },
  {
    to: '/admin/leads',
    label: 'Leads',
    icon: Mail,
    visible: (r) => !!r.isAdmin || !!r.isSales,
  },
  {
    to: '/admin/audit',
    label: 'Audit log',
    icon: ScrollText,
    visible: (r) => !!r.isAdmin,
  },
];

const AdminNav = () => {
  const role = useUserRole();
  const location = useLocation();

  if (role.isLoading) return null;
  if (!role.isStaff) return null;

  const visible = ITEMS.filter((i) => i.visible(role));
  if (visible.length === 0) return null;

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto">
        <div className="flex items-center gap-1 py-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mr-2 shrink-0">
            <Shield className="h-3.5 w-3.5" />
            Staff
          </div>
          {visible.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.to ||
              (item.to !== '/dashboard' && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminNav;
