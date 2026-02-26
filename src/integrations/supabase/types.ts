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
      ai_accuracy_stats: {
        Row: {
          agency: string
          edit_rate: number
          id: string
          item_type: string
          last_updated: string
          top_error_category: string | null
          total_edits: number
          total_notes_generated: number
          violation_type: string | null
        }
        Insert: {
          agency: string
          edit_rate?: number
          id?: string
          item_type: string
          last_updated?: string
          top_error_category?: string | null
          total_edits?: number
          total_notes_generated?: number
          violation_type?: string | null
        }
        Update: {
          agency?: string
          edit_rate?: number
          id?: string
          item_type?: string
          last_updated?: string
          top_error_category?: string | null
          total_edits?: number
          total_notes_generated?: number
          violation_type?: string | null
        }
        Relationships: []
      }
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
          property_status_summary: string | null
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
          property_status_summary?: string | null
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
          property_status_summary?: string | null
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
      knowledge_candidates: {
        Row: {
          agency: string
          created_at: string
          demand_score: number
          id: string
          knowledge_type: Database["public"]["Enums"]["knowledge_type"]
          priority: string
          source_edit_ids: Json | null
          status: string
          title: string
          trigger_reason: string | null
          updated_at: string
          violation_types: Json | null
        }
        Insert: {
          agency: string
          created_at?: string
          demand_score?: number
          id?: string
          knowledge_type: Database["public"]["Enums"]["knowledge_type"]
          priority?: string
          source_edit_ids?: Json | null
          status?: string
          title: string
          trigger_reason?: string | null
          updated_at?: string
          violation_types?: Json | null
        }
        Update: {
          agency?: string
          created_at?: string
          demand_score?: number
          id?: string
          knowledge_type?: Database["public"]["Enums"]["knowledge_type"]
          priority?: string
          source_edit_ids?: Json | null
          status?: string
          title?: string
          trigger_reason?: string | null
          updated_at?: string
          violation_types?: Json | null
        }
        Relationships: []
      }
      knowledge_entries: {
        Row: {
          agency: string
          approved_at: string | null
          approved_by: string | null
          candidate_id: string | null
          content: string
          generated_at: string
          id: string
          status: string
          title: string
          usage_count: number
          violation_types: Json | null
          word_count: number
        }
        Insert: {
          agency: string
          approved_at?: string | null
          approved_by?: string | null
          candidate_id?: string | null
          content: string
          generated_at?: string
          id?: string
          status?: string
          title: string
          usage_count?: number
          violation_types?: Json | null
          word_count?: number
        }
        Update: {
          agency?: string
          approved_at?: string | null
          approved_by?: string | null
          candidate_id?: string | null
          content?: string
          generated_at?: string
          id?: string
          status?: string
          title?: string
          usage_count?: number
          violation_types?: Json | null
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "knowledge_candidates"
            referencedColumns: ["id"]
          },
        ]
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
      report_edits: {
        Row: {
          agency: string
          batch_id: string | null
          created_at: string
          edited_note: string
          editor_id: string
          error_category: Database["public"]["Enums"]["edit_error_category"]
          id: string
          item_identifier: string
          item_type: string
          original_note: string | null
          report_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          agency: string
          batch_id?: string | null
          created_at?: string
          edited_note: string
          editor_id: string
          error_category: Database["public"]["Enums"]["edit_error_category"]
          id?: string
          item_identifier: string
          item_type: string
          original_note?: string | null
          report_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          agency?: string
          batch_id?: string | null
          created_at?: string
          edited_note?: string
          editor_id?: string
          error_category?: Database["public"]["Enums"]["edit_error_category"]
          id?: string
          item_identifier?: string
          item_type?: string
          original_note?: string | null
          report_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_edits_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
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
      edit_error_category:
        | "too_vague"
        | "wrong_severity"
        | "missing_context"
        | "stale_treated_as_active"
        | "wrong_agency_explanation"
        | "missing_note"
        | "factual_error"
        | "tone_style"
        | "knowledge_gap"
        | "other"
      knowledge_type:
        | "violation_guide"
        | "agency_explainer"
        | "regulation_reference"
        | "penalty_context"
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
      edit_error_category: [
        "too_vague",
        "wrong_severity",
        "missing_context",
        "stale_treated_as_active",
        "wrong_agency_explanation",
        "missing_note",
        "factual_error",
        "tone_style",
        "knowledge_gap",
        "other",
      ],
      knowledge_type: [
        "violation_guide",
        "agency_explainer",
        "regulation_reference",
        "penalty_context",
      ],
    },
  },
} as const
