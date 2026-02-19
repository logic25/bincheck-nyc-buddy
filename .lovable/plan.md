

# Admin Role + Admin Panel for Client Support

## The Problem

All tables (dd_reports, saved_reports, profiles) have RLS policies that only let users see their own data. As the developer/operator, you have zero visibility into client reports. If someone calls with a question, you can't look up their report.

## The Solution

Add a role-based system so admin users can see all reports and user data, while regular users continue to see only their own.

---

## Phase 1: Database Migration

### Create role infrastructure

1. Create an `app_role` enum with values: `admin`, `user`
2. Create a `user_roles` table (user_id + role, unique constraint)
3. Create a `has_role()` security definer function to safely check roles without recursive RLS
4. Add RLS policies on `user_roles` so users can read their own role

### Expand profiles table

Add columns: `company_name` (text), `phone` (text), `license_id` (text) -- useful for settings later

### Add admin RLS policies to existing tables

- `dd_reports`: New SELECT policy -- admins can view ALL reports
- `saved_reports`: New SELECT policy -- admins can view ALL saved searches
- `profiles`: New SELECT policy -- admins can view ALL profiles

These use the `has_role()` function so there's no recursive RLS issue.

### Seed your admin role

After migration, insert your user_id into `user_roles` with role = `admin`. I'll look up your user_id from the profiles table to provide the exact SQL.

---

## Phase 2: Admin Hook

Create `src/hooks/useUserRole.ts`:
- Calls `has_role` via Supabase RPC to check if current user is admin
- Returns `{ isAdmin, isLoading }`
- Used throughout the app to conditionally show admin features

---

## Phase 3: Admin Page (`/admin`)

A new page at `/admin` with tabs:

### Users Tab
- List all users (from profiles table) with email, display name, signup date
- Click a user to see their reports

### All Reports Tab
- List ALL DD reports across all users with search by address or client name
- Click any report to open it in the existing DDReportViewer
- Shows who created each report (user email/name)

### Stats Tab (simple)
- Total users, total DD reports, reports this week/month

### Access Control
- Route protected: non-admins redirected to `/dashboard`
- Loading state while role is being checked

---

## Phase 4: User Settings Page (`/settings`)

A new page at `/settings` for all authenticated users:

### Profile Tab
- Edit display name, company name, phone, license ID
- Saves to expanded `profiles` table

### Security Tab
- Change password (for email-based users)

### Account Tab
- Sign out button

---

## Phase 5: Navigation Updates

- Add "Settings" (gear icon) to Dashboard and DD Reports headers -- visible to all users
- Add "Admin" link to headers -- only visible when `isAdmin` is true
- Add routes `/admin` and `/settings` to App.tsx

---

## Technical Details

### SQL Migration

```text
-- Role enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS on user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin policies on existing tables
CREATE POLICY "Admins can view all dd reports"
  ON public.dd_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all saved reports"
  ON public.saved_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Expand profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS license_id text;
```

### Files to Create/Modify

| File | Action |
|------|--------|
| Database migration | Role system + admin policies + profile columns |
| `src/hooks/useUserRole.ts` | New -- checks admin status via RPC |
| `src/pages/Admin.tsx` | New -- admin panel with users, reports, stats tabs |
| `src/pages/Settings.tsx` | New -- user settings (profile, security, account) |
| `src/App.tsx` | Add `/admin` and `/settings` routes |
| `src/pages/Dashboard.tsx` | Add Settings + Admin nav links |
| `src/pages/DDReports.tsx` | Add Settings + Admin nav links to header |

