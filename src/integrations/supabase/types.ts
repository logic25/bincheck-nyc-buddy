export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string | null
          estimated_cost_usd: number | null
          feature: string
          id: string
          metadata: Json | null
          model: string
          prompt_tokens: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          feature: string
          id?: string
          metadata?: Json | null
          model: string
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          feature?: string
          id?: string
          metadata?: Json | null
          model?: string
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      dd_reports: {
        Row: {
          address: string
          ai_analysis: string | null
          applications_data: Json | null
          bbl: string | null
          bin: string | null
          building_data: Json | null
          client_email: string | null
          client_firm: string | null
          client_name: string | null
          complaints_data: Json | null
          created_at: string
          customer_concern: string | null
          general_notes: string | null
          generation_started_at: string | null
          id: string
          line_item_notes: Json | null
          order_lead_id: string | null
          orders_data: Json | null
          payment_amount: number | null
          payment_status: string | null
          pdf_url: string | null
          prepared_by: string | null
          prepared_for: string
          report_date: string
          requested_delivery_date: string | null
          rush_requested: boolean | null
          status: string
          updated_at: string
          user_id: string
          violations_data: Json | null
        }
        Insert: {
          address?: string
          ai_analysis?: string | null
          applications_data?: Json | null
          bbl?: string | null
          bin?: string | null
          building_data?: Json | null
          client_email?: string | null
          client_firm?: string | null
          client_name?: string | null
          complaints_data?: Json | null
          created_at?: string
          customer_concern?: string | null
          general_notes?: string | null
          generation_started_at?: string | null
          id?: string
          line_item_notes?: Json | null
          order_lead_id?: string | null
          orders_data?: Json | null
          payment_amount?: number | null
          payment_status?: string | null
          pdf_url?: string | null
          prepared_by?: string | null
          prepared_for?: string
          report_date?: string
          requested_delivery_date?: string | null
          rush_requested?: boolean | null
          status?: string
          updated_at?: string
          user_id: string
          violations_data?: Json | null
        }
        Update: {
          address?: string
          ai_analysis?: string | null
          applications_data?: Json | null
          bbl?: string | null
          bin?: string | null
          building_data?: Json | null
          client_email?: string | null
          client_firm?: string | null
          client_name?: string | null
          complaints_data?: Json | null
          created_at?: string
          customer_concern?: string | null
          general_notes?: string | null
          generation_started_at?: string | null
          id?: string
          line_item_notes?: Json | null
          order_lead_id?: string | null
          orders_data?: Json | null
          payment_amount?: number | null
          payment_status?: string | null
          pdf_url?: string | null
          prepared_by?: string | null
          prepared_for?: string
          report_date?: string
          requested_delivery_date?: string | null
          rush_requested?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string
          violations_data?: Json | null
        }
        Relationships: []
      }
      order_leads: {
        Row: {
          address: string | null
          company: string | null
          concern: string | null
          converted: boolean | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          requested_delivery_date: string | null
          rush_requested: boolean | null
          step_reached: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          concern?: string | null
          converted?: boolean | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          requested_delivery_date?: string | null
          rush_requested?: boolean | null
          step_reached?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          concern?: string | null
          converted?: boolean | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          requested_delivery_date?: string | null
          rush_requested?: boolean | null
          step_reached?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          display_name: string | null
          id: string
          license_id: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          license_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          license_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      roadmap_items: {
        Row: {
          ai_challenges: Json | null
          ai_duplicate_warning: string | null
          ai_evidence: string | null
          ai_tested: boolean | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_challenges?: Json | null
          ai_duplicate_warning?: string | null
          ai_evidence?: string | null
          ai_tested?: boolean | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_challenges?: Json | null
          ai_duplicate_warning?: string | null
          ai_evidence?: string | null
          ai_tested?: boolean | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      saved_reports: {
        Row: {
          address: string
          bin: string
          compliance_score: number
          created_at: string
          id: string
          report_data: Json
          risk_level: string
          user_id: string
        }
        Insert: {
          address?: string
          bin: string
          compliance_score?: number
          created_at?: string
          id?: string
          report_data?: Json
          risk_level?: string
          user_id: string
        }
        Update: {
          address?: string
          bin?: string
          compliance_score?: number
          created_at?: string
          id?: string
          report_data?: Json
          risk_level?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_users_with_email: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
