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
      acris_cache: {
        Row: {
          bbl: string
          cache_key: string
          created_at: string
          expires_at: string | null
          fetched_at: string
          id: string
          payload: Json
        }
        Insert: {
          bbl: string
          cache_key: string
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          payload: Json
        }
        Update: {
          bbl?: string
          cache_key?: string
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
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
      architect_requests: {
        Row: {
          assigned_architect: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          id: string
          letter_file_url: string | null
          price_quoted: number
          property_address: string
          report_id: string
          request_description: string | null
          status: string
          updated_at: string
          urgency: string
          user_id: string
          violation_numbers: Json
        }
        Insert: {
          assigned_architect?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          letter_file_url?: string | null
          price_quoted?: number
          property_address: string
          report_id: string
          request_description?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          user_id: string
          violation_numbers?: Json
        }
        Update: {
          assigned_architect?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          letter_file_url?: string | null
          price_quoted?: number
          property_address?: string
          report_id?: string
          request_description?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          user_id?: string
          violation_numbers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "architect_requests_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          id: number
          ip_address: string | null
          metadata: Json | null
          occurred_at: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          id?: number
          ip_address?: string | null
          metadata?: Json | null
          occurred_at?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          id?: number
          ip_address?: string | null
          metadata?: Json | null
          occurred_at?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      bug_comments: {
        Row: {
          attachments: Json | null
          bug_id: string
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          bug_id: string
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          bug_id?: string
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_comments_bug_id_fkey"
            columns: ["bug_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          attachments: Json | null
          created_at: string
          description: string
          id: string
          loom_url: string | null
          page: string
          priority: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          description: string
          id?: string
          loom_url?: string | null
          page: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          description?: string
          id?: string
          loom_url?: string | null
          page?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      closeout_requests: {
        Row: {
          application_numbers: Json
          assigned_expediter: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          id: string
          price_quoted: number
          property_address: string
          report_id: string
          request_description: string | null
          status: string
          updated_at: string
          urgency: string
          user_id: string
        }
        Insert: {
          application_numbers?: Json
          assigned_expediter?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          price_quoted?: number
          property_address: string
          report_id: string
          request_description?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          user_id: string
        }
        Update: {
          application_numbers?: Json
          assigned_expediter?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          price_quoted?: number
          property_address?: string
          report_id?: string
          request_description?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "closeout_requests_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_snapshots: {
        Row: {
          address: string
          as_of: string
          bbl: string
          bin: string
          borough: string | null
          created_at: string
          data: Json
          data_hash: string
          id: string
          report_id: string | null
          scope_of_work: string | null
          sources: Json
          subject_type: string | null
          subject_unit: string | null
        }
        Insert: {
          address: string
          as_of?: string
          bbl: string
          bin: string
          borough?: string | null
          created_at?: string
          data: Json
          data_hash: string
          id?: string
          report_id?: string | null
          scope_of_work?: string | null
          sources?: Json
          subject_type?: string | null
          subject_unit?: string | null
        }
        Update: {
          address?: string
          as_of?: string
          bbl?: string
          bin?: string
          borough?: string | null
          created_at?: string
          data?: Json
          data_hash?: string
          id?: string
          report_id?: string | null
          scope_of_work?: string | null
          sources?: Json
          subject_type?: string | null
          subject_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_sell_impressions: {
        Row: {
          clicked_at: string | null
          client_email: string
          converted_at: string | null
          cta_type: string
          id: string
          report_id: string
          sent_at: string
        }
        Insert: {
          clicked_at?: string | null
          client_email: string
          converted_at?: string | null
          cta_type: string
          id?: string
          report_id: string
          sent_at?: string
        }
        Update: {
          clicked_at?: string | null
          client_email?: string
          converted_at?: string | null
          cta_type?: string
          id?: string
          report_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      dd_reports: {
        Row: {
          acris_data: Json | null
          address: string
          agencies_queried: Json | null
          ai_analysis: string | null
          applications_data: Json | null
          approved_at: string | null
          approved_by: string | null
          bbl: string | null
          bin: string | null
          building_data: Json | null
          citisignal_recommended: boolean | null
          client_email: string | null
          client_firm: string | null
          client_name: string | null
          co_data: Json | null
          complaints_data: Json | null
          created_at: string
          customer_concern: string | null
          dep_charges_data: Json | null
          dep_fetched_at: string | null
          dep_source: string | null
          dof_charges_data: Json | null
          dof_fetched_at: string | null
          dof_source: string | null
          error_message: string | null
          external_links: Json | null
          fdny_bfp_data: Json | null
          fdny_direct_data: Json | null
          fdny_vacate_data: Json | null
          fuel_tank_data: Json | null
          general_notes: string | null
          generation_started_at: string | null
          hpd_erp_data: Json | null
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
          requested_by_role: string | null
          requested_delivery_date: string | null
          resolution_confidence: string | null
          resolution_source: string | null
          resolution_warnings: Json | null
          rush_requested: boolean | null
          scope_of_work: string | null
          sent_at: string | null
          sent_to_email: string | null
          sidewalk_data: Json | null
          status: string
          subject_type: string | null
          subject_unit: string | null
          summary_edited_at: string | null
          summary_edited_by: string | null
          summary_override: string | null
          tax_lien_data: Json | null
          updated_at: string
          user_id: string
          violations_data: Json | null
          workflow_status: string | null
        }
        Insert: {
          acris_data?: Json | null
          address?: string
          agencies_queried?: Json | null
          ai_analysis?: string | null
          applications_data?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          bbl?: string | null
          bin?: string | null
          building_data?: Json | null
          citisignal_recommended?: boolean | null
          client_email?: string | null
          client_firm?: string | null
          client_name?: string | null
          co_data?: Json | null
          complaints_data?: Json | null
          created_at?: string
          customer_concern?: string | null
          dep_charges_data?: Json | null
          dep_fetched_at?: string | null
          dep_source?: string | null
          dof_charges_data?: Json | null
          dof_fetched_at?: string | null
          dof_source?: string | null
          error_message?: string | null
          external_links?: Json | null
          fdny_bfp_data?: Json | null
          fdny_direct_data?: Json | null
          fdny_vacate_data?: Json | null
          fuel_tank_data?: Json | null
          general_notes?: string | null
          generation_started_at?: string | null
          hpd_erp_data?: Json | null
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
          requested_by_role?: string | null
          requested_delivery_date?: string | null
          resolution_confidence?: string | null
          resolution_source?: string | null
          resolution_warnings?: Json | null
          rush_requested?: boolean | null
          scope_of_work?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          sidewalk_data?: Json | null
          status?: string
          subject_type?: string | null
          subject_unit?: string | null
          summary_edited_at?: string | null
          summary_edited_by?: string | null
          summary_override?: string | null
          tax_lien_data?: Json | null
          updated_at?: string
          user_id: string
          violations_data?: Json | null
          workflow_status?: string | null
        }
        Update: {
          acris_data?: Json | null
          address?: string
          agencies_queried?: Json | null
          ai_analysis?: string | null
          applications_data?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          bbl?: string | null
          bin?: string | null
          building_data?: Json | null
          citisignal_recommended?: boolean | null
          client_email?: string | null
          client_firm?: string | null
          client_name?: string | null
          co_data?: Json | null
          complaints_data?: Json | null
          created_at?: string
          customer_concern?: string | null
          dep_charges_data?: Json | null
          dep_fetched_at?: string | null
          dep_source?: string | null
          dof_charges_data?: Json | null
          dof_fetched_at?: string | null
          dof_source?: string | null
          error_message?: string | null
          external_links?: Json | null
          fdny_bfp_data?: Json | null
          fdny_direct_data?: Json | null
          fdny_vacate_data?: Json | null
          fuel_tank_data?: Json | null
          general_notes?: string | null
          generation_started_at?: string | null
          hpd_erp_data?: Json | null
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
          requested_by_role?: string | null
          requested_delivery_date?: string | null
          resolution_confidence?: string | null
          resolution_source?: string | null
          resolution_warnings?: Json | null
          rush_requested?: boolean | null
          scope_of_work?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          sidewalk_data?: Json | null
          status?: string
          subject_type?: string | null
          subject_unit?: string | null
          summary_edited_at?: string | null
          summary_edited_by?: string | null
          summary_override?: string | null
          tax_lien_data?: Json | null
          updated_at?: string
          user_id?: string
          violations_data?: Json | null
          workflow_status?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          error: string | null
          id: string
          metadata: Json | null
          recipient: string
          report_id: string
          resend_id: string | null
          sent_at: string
          sent_by: string | null
          status: string
          subject: string | null
        }
        Insert: {
          error?: string | null
          id?: string
          metadata?: Json | null
          recipient: string
          report_id: string
          resend_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          error?: string | null
          id?: string
          metadata?: Json | null
          recipient?: string
          report_id?: string
          resend_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          notes: string | null
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          notes?: string | null
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          notes?: string | null
          use_count?: number
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
      line_item_notes: {
        Row: {
          agency: string | null
          ai_confidence: number | null
          created_at: string
          id: string
          impact_note: string | null
          line_item_id: string
          line_item_type: string
          note_text: string | null
          report_id: string
          unit_relevance: string | null
          updated_at: string
        }
        Insert: {
          agency?: string | null
          ai_confidence?: number | null
          created_at?: string
          id?: string
          impact_note?: string | null
          line_item_id: string
          line_item_type: string
          note_text?: string | null
          report_id: string
          unit_relevance?: string | null
          updated_at?: string
        }
        Update: {
          agency?: string | null
          ai_confidence?: number | null
          created_at?: string
          id?: string
          impact_note?: string | null
          line_item_id?: string
          line_item_type?: string
          note_text?: string | null
          report_id?: string
          unit_relevance?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_item_notes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          company: string | null
          confirmation_status: string | null
          contacted_at: string | null
          converted_at: string | null
          converted_to_report_id: string | null
          created_at: string
          email: string
          id: string
          intent: string | null
          message: string | null
          name: string | null
          notes: string | null
          property_address: string | null
          referrer: string | null
          role: string | null
          status: string
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          company?: string | null
          confirmation_status?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          converted_to_report_id?: string | null
          created_at?: string
          email: string
          id?: string
          intent?: string | null
          message?: string | null
          name?: string | null
          notes?: string | null
          property_address?: string | null
          referrer?: string | null
          role?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          company?: string | null
          confirmation_status?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          converted_to_report_id?: string | null
          created_at?: string
          email?: string
          id?: string
          intent?: string | null
          message?: string | null
          name?: string | null
          notes?: string | null
          property_address?: string | null
          referrer?: string | null
          role?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_converted_to_report_id_fkey"
            columns: ["converted_to_report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      order_leads: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          company: string | null
          concern: string | null
          converted: boolean | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          rejection_reason: string | null
          report_id: string | null
          requested_by_role: string | null
          requested_delivery_date: string | null
          rush_requested: boolean | null
          scope_of_work: string | null
          status: string
          step_reached: number | null
          subject_type: string | null
          subject_unit: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company?: string | null
          concern?: string | null
          converted?: boolean | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          rejection_reason?: string | null
          report_id?: string | null
          requested_by_role?: string | null
          requested_delivery_date?: string | null
          rush_requested?: boolean | null
          scope_of_work?: string | null
          status?: string
          step_reached?: number | null
          subject_type?: string | null
          subject_unit?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company?: string | null
          concern?: string | null
          converted?: boolean | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          rejection_reason?: string | null
          report_id?: string | null
          requested_by_role?: string | null
          requested_delivery_date?: string | null
          rush_requested?: boolean | null
          scope_of_work?: string | null
          status?: string
          step_reached?: number | null
          subject_type?: string | null
          subject_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_leads_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
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
      rate_limit_buckets: {
        Row: {
          count: number
          created_at: string
          key: string
          window_start_minute: string
        }
        Insert: {
          count?: number
          created_at?: string
          key: string
          window_start_minute: string
        }
        Update: {
          count?: number
          created_at?: string
          key?: string
          window_start_minute?: string
        }
        Relationships: []
      }
      report_documents: {
        Row: {
          agency: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          doc_ref: string | null
          doc_type: string
          fetched_at: string | null
          fetched_by: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          notes: string | null
          priority: number
          report_id: string
          source_url: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          agency: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_ref?: string | null
          doc_type: string
          fetched_at?: string | null
          fetched_by?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          priority?: number
          report_id: string
          source_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          agency?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_ref?: string | null
          doc_type?: string
          fetched_at?: string | null
          fetched_by?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          priority?: number
          report_id?: string
          source_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_documents_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
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
          impact_note: string | null
          item_identifier: string
          item_type: string
          original_note: string | null
          report_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          unit_relevance: string | null
        }
        Insert: {
          agency: string
          batch_id?: string | null
          created_at?: string
          edited_note: string
          editor_id: string
          error_category: Database["public"]["Enums"]["edit_error_category"]
          id?: string
          impact_note?: string | null
          item_identifier: string
          item_type: string
          original_note?: string | null
          report_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          unit_relevance?: string | null
        }
        Update: {
          agency?: string
          batch_id?: string | null
          created_at?: string
          edited_note?: string
          editor_id?: string
          error_category?: Database["public"]["Enums"]["edit_error_category"]
          id?: string
          impact_note?: string | null
          item_identifier?: string
          item_type?: string
          original_note?: string | null
          report_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          unit_relevance?: string | null
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      compliance_snapshot_latest: {
        Row: {
          address: string | null
          as_of: string | null
          bbl: string | null
          bin: string | null
          borough: string | null
          created_at: string | null
          data: Json | null
          data_hash: string | null
          id: string | null
          report_id: string | null
          scope_of_work: string | null
          sources: Json | null
          subject_type: string | null
          subject_unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dd_reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_rate_limit: {
        Args: { _key: string; _max_in_window: number; _window_minutes?: number }
        Returns: Json
      }
      cleanup_rate_limit_buckets: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_acris_cache: { Args: { _bbl: string }; Returns: Json }
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
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      prune_acris_cache: { Args: { _grace?: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      seed_report_documents: {
        Args: { _docs: Json; _report_id: string }
        Returns: number
      }
      submit_lead: {
        Args: {
          _company?: string
          _email: string
          _intent?: string
          _message?: string
          _name?: string
          _property_address?: string
          _referrer?: string
          _role?: string
          _user_agent?: string
          _utm_campaign?: string
          _utm_medium?: string
          _utm_source?: string
        }
        Returns: Json
      }
      upsert_acris_cache: {
        Args: { _bbl: string; _payload: Json; _source?: string; _ttl?: string }
        Returns: {
          bbl: string
          cache_key: string
          created_at: string
          expires_at: string | null
          fetched_at: string
          id: string
          payload: Json
        }
        SetofOptions: {
          from: "*"
          to: "acris_cache"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user" | "analyst" | "sales"
      dd_report_status:
        | "lead_pending"
        | "lead_approved"
        | "data_fetching"
        | "data_ready"
        | "analyst_review"
        | "analyst_approved"
        | "sent"
        | "delivered"
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
      app_role: ["admin", "user", "analyst", "sales"],
      dd_report_status: [
        "lead_pending",
        "lead_approved",
        "data_fetching",
        "data_ready",
        "analyst_review",
        "analyst_approved",
        "sent",
        "delivered",
      ],
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
