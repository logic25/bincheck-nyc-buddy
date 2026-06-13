import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const LOVABLE_CLOUD_URL = "https://ohoutpkgkxfueyllgfvv.supabase.co";
const LOVABLE_CLOUD_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJvaG91dHBrZ2t4ZnVleWxsZ2Z2diIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcxNDc4ODc2LCJleHAiOjIwODcwNTQ4NzZ9.qHFP8SOYfspc3Ta_wLq6tt3eWeeYBnQ_eoQYk1fCivY";

process.env.VITE_SUPABASE_PROJECT_ID ||= "ohoutpkgkxfueyllgfvv";
process.env.VITE_SUPABASE_URL ||= LOVABLE_CLOUD_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= LOVABLE_CLOUD_PUBLISHABLE_KEY;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
