import { PropertyData } from "@/types/property";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin } from "lucide-react";

interface PropertyHeaderProps {
  data: PropertyData;
}

const boroughMap: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
  MANHATTAN: "Manhattan", BRONX: "Bronx", BROOKLYN: "Brooklyn", QUEENS: "Queens", "STATEN ISLAND": "Staten Island",
};

export function PropertyHeader({ data }: PropertyHeaderProps) {
  const boroughName = boroughMap[data.borough] || data.borough || "Unknown";

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10 shrink-0">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1 flex-1">
            <h1 className="font-display text-2xl font-bold">{data.address || "Unknown Address"}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{boroughName}</span>
              <span className="text-border">|</span>
              <span>BIN: <span className="font-mono text-foreground">{data.bin}</span></span>
              {data.block && (
                <>
                  <span className="text-border">|</span>
                  <span>Block: {data.block}</span>
                </>
              )}
              {data.lot && (
                <>
                  <span className="text-border">|</span>
                  <span>Lot: {data.lot}</span>
                </>
              )}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 font-mono">
            {new Date().toLocaleDateString()}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
