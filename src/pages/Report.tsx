import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyData } from "@/types/property";
import { calculateComplianceScore } from "@/lib/scoring";
import { PropertyHeader } from "@/components/report/PropertyHeader";
import { ScoreCard } from "@/components/report/ScoreCard";
import { ViolationsSection } from "@/components/report/ViolationsSection";
import { PermitsSection } from "@/components/report/PermitsSection";
import { ReportSummary } from "@/components/report/ReportSummary";
import { ReportActions } from "@/components/report/ReportActions";
import { Shield, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const Report = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bin = searchParams.get("bin");
  const address = searchParams.get("address");

  const { data, isLoading, error } = useQuery({
    queryKey: ["property", bin, address],
    queryFn: async (): Promise<PropertyData> => {
      const { data, error } = await supabase.functions.invoke("search-property", {
        body: { bin: bin || undefined, address: address || undefined },
      });
      if (error) throw new Error(error.message || "Failed to fetch property data");
      if (data.error) throw new Error(data.error);
      return data as PropertyData;
    },
    enabled: !!(bin || address),
  });

  let score = null;
  try {
    score = data ? calculateComplianceScore(data) : null;
  } catch (e) {
    console.error("Score calculation failed:", e);
  }

  // Surface data.error even when React Query doesn't throw
  const dataError = (data as any)?.error;

  if (!bin && !address) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold tracking-tight">BinCheck<span className="text-primary">NYC</span></span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> New Search
          </Button>
        </div>
      </header>

      <main className="container py-8 space-y-6 max-w-5xl">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Fetching property data from NYC databases...</p>
          </div>
        )}

        {(error || dataError) && (
          <div className="text-center py-24 space-y-4">
            <p className="text-destructive font-semibold text-lg">
              {dataError || (error as Error)?.message || "Failed to load property data."}
            </p>
            <Button onClick={() => navigate("/")} variant="outline">Try another search</Button>
          </div>
        )}

        {data && !dataError && score && (
          <>
            <PropertyHeader data={data} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <ScoreCard score={score} />
              </div>
              <div className="lg:col-span-2">
                <ReportActions data={data} score={score} />
              </div>
            </div>
            <ViolationsSection data={data} />
            <PermitsSection permits={data.permits} />
            <ReportSummary data={data} score={score} />
          </>
        )}

        {data && !dataError && !score && !isLoading && (
          <div className="text-center py-24 space-y-4">
            <p className="text-muted-foreground font-semibold">Property data found but compliance score could not be calculated.</p>
            <Button onClick={() => navigate("/")} variant="outline">Try another search</Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Report;
