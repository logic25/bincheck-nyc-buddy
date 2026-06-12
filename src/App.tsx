import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Report from "./pages/Report";
import Order from "./pages/Order";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DDReports from "./pages/DDReports";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import AdminTeam from "./pages/AdminTeam";
import AdminDocuments from "./pages/AdminDocuments";
import AdminAudit from "./pages/AdminAudit";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/report" element={<Report />} />
          <Route path="/order" element={<Order />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dd-reports" element={<DDReports />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/team" element={<AdminTeam />} />
          <Route path="/admin/documents" element={<AdminDocuments />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

