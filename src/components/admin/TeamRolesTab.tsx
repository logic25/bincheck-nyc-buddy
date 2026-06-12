import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Users, Shield, Briefcase, UserCog, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { AppRole } from '@/hooks/useUserRole';

// Roles a human can be assigned (admin/analyst/sales). Every authenticated
// user implicitly has 'user' access via RLS owner checks, so we don't show
// it as something to add or remove.
const STAFF_ROLES: { value: AppRole; label: string; description: string; tone: string; icon: typeof Shield }[] = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access. Can manage roles, all reports, billing.',
    tone: 'bg-rose-100 text-rose-700 border-rose-200',
    icon: Shield,
  },
  {
    value: 'analyst',
    label: 'Analyst',
    description: 'Reads + edits every due-diligence report. Runs the back office.',
    tone: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: UserCog,
  },
  {
    value: 'sales',
    label: 'Sales',
    description: 'Reads reports + manages the order-leads pipeline.',
    tone: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: Briefcase,
  },
];

interface UserWithEmail {
  user_id: string;
  email: string;
  created_at: string;
}

interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
}

const TeamRolesTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  // --- Users ----------------------------------------------------------
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_users_with_email');
      if (error) throw error;
      return (data as UserWithEmail[]) || [];
    },
  });

  // --- Roles ----------------------------------------------------------
  // Admins can SELECT every row via the new RLS policy.
  const { data: rolesData = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role');
      if (error) throw error;
      return (data as UserRoleRow[]) || [];
    },
  });

  // Roles keyed by user_id for O(1) lookup in the table.
  const rolesByUser = useMemo(() => {
    const map = new Map<string, UserRoleRow[]>();
    for (const r of rolesData) {
      const list = map.get(r.user_id) ?? [];
      list.push(r);
      map.set(r.user_id, list);
    }
    return map;
  }, [rolesData]);

  // --- Mutations ------------------------------------------------------
  const assignMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      toast.success('Role assigned');
    },
    onError: (err: Error) => {
      // Unique constraint = already has role; surface a friendlier message.
      if (err.message.toLowerCase().includes('duplicate')) {
        toast.error('User already has that role');
      } else {
        toast.error(err.message);
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (roleRowId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleRowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      toast.success('Role removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Filtering ------------------------------------------------------
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      u.email.toLowerCase().includes(term) || u.user_id.toLowerCase().includes(term),
    );
  }, [users, search]);

  const isLoading = usersLoading || rolesLoading;

  // --- Render ---------------------------------------------------------
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team &amp; Roles
              </CardTitle>
              <CardDescription>
                Assign analyst, sales, or admin access. Everyone else stays a client.
              </CardDescription>
            </div>
            <div className="hidden md:flex items-center gap-3 text-sm text-muted-foreground">
              <span>{users.length} users</span>
              <span>·</span>
              <span>{rolesData.length} role assignments</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Role legend */}
          <div className="grid gap-3 md:grid-cols-3">
            {STAFF_ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.value}
                  className="rounded-lg border bg-card p-3 flex items-start gap-3"
                >
                  <Badge className={`${r.tone} border shrink-0`} variant="outline">
                    <Icon className="h-3 w-3 mr-1" />
                    {r.label}
                  </Badge>
                  <p className="text-xs text-muted-foreground leading-snug">{r.description}</p>
                </div>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Users table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Current roles</TableHead>
                    <TableHead className="text-right">Assign</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {search ? 'No users match that search.' : 'No users yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => {
                      const userRoles = rolesByUser.get(user.user_id) ?? [];
                      const heldRoleValues = new Set(userRoles.map((r) => r.role));

                      return (
                        <TableRow key={user.user_id}>
                          <TableCell>
                            <div className="font-medium">{user.email || '(no email)'}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {user.user_id.slice(0, 8)}…
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {user.created_at
                              ? format(new Date(user.created_at), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {userRoles.length === 0 ? (
                                <span className="text-xs text-muted-foreground">Client</span>
                              ) : (
                                userRoles.map((r) => {
                                  const meta = STAFF_ROLES.find((s) => s.value === r.role);
                                  return (
                                    <AlertDialog key={r.id}>
                                      <AlertDialogTrigger asChild>
                                        <button
                                          type="button"
                                          className="inline-flex"
                                          disabled={removeMutation.isPending}
                                          title="Click to remove this role"
                                        >
                                          <Badge
                                            className={`${meta?.tone ?? ''} border cursor-pointer hover:opacity-80`}
                                            variant="outline"
                                          >
                                            {meta?.label ?? r.role}
                                            <span className="ml-1 opacity-60">×</span>
                                          </Badge>
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            Remove {meta?.label ?? r.role} role?
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            {user.email || user.user_id} will lose{' '}
                                            {meta?.label ?? r.role} access immediately.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => removeMutation.mutate(r.id)}
                                          >
                                            Remove
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap gap-1 justify-end">
                              {STAFF_ROLES.map((s) => {
                                if (heldRoleValues.has(s.value)) return null;
                                return (
                                  <Button
                                    key={s.value}
                                    size="sm"
                                    variant="outline"
                                    disabled={assignMutation.isPending}
                                    onClick={() =>
                                      assignMutation.mutate({
                                        userId: user.user_id,
                                        role: s.value,
                                      })
                                    }
                                  >
                                    {assignMutation.isPending &&
                                    assignMutation.variables?.userId === user.user_id &&
                                    assignMutation.variables?.role === s.value ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      `+ ${s.label}`
                                    )}
                                  </Button>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Tip: click a role badge in the &quot;Current roles&quot; column to revoke it. All
            changes are logged via Postgres RLS — only signed-in admins can read or write
            this table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamRolesTab;
