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
      achievements: {
        Row: {
          certificate_number: string | null
          created_at: string | null
          date_earned: string | null
          dog_id: string
          id: string
          notes: string | null
          organization: string | null
          sport: string | null
          title: string
        }
        Insert: {
          certificate_number?: string | null
          created_at?: string | null
          date_earned?: string | null
          dog_id: string
          id?: string
          notes?: string | null
          organization?: string | null
          sport?: string | null
          title: string
        }
        Update: {
          certificate_number?: string | null
          created_at?: string | null
          date_earned?: string | null
          dog_id?: string
          id?: string
          notes?: string | null
          organization?: string | null
          sport?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          description: string
          id: string
          metadata: Json | null
          record_id: string | null
          record_type: string | null
          trial_id: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          record_id?: string | null
          record_type?: string | null
          trial_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          record_id?: string | null
          record_type?: string | null
          trial_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "activity_log_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      allergies: {
        Row: {
          allergen: string
          created_at: string | null
          diagnosed_date: string | null
          dog_id: string
          id: string
          notes: string | null
          reaction: string | null
          severity: string | null
        }
        Insert: {
          allergen: string
          created_at?: string | null
          diagnosed_date?: string | null
          dog_id: string
          id?: string
          notes?: string | null
          reaction?: string | null
          severity?: string | null
        }
        Update: {
          allergen?: string
          created_at?: string | null
          diagnosed_date?: string | null
          dog_id?: string
          id?: string
          notes?: string | null
          reaction?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allergies_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          page: string
          section_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          page: string
          section_name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page?: string
          section_name?: string
          user_id?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string | null
          user_id: string | null
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string | null
          user_id?: string | null
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_published: boolean | null
          license_key: string | null
          priority: string | null
          published_at: string | null
          show_id: string | null
          target_audience: string[] | null
          title: string
          trial_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean | null
          license_key?: string | null
          priority?: string | null
          published_at?: string | null
          show_id?: string | null
          target_audience?: string[] | null
          title: string
          trial_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_published?: boolean | null
          license_key?: string | null
          priority?: string | null
          published_at?: string | null
          show_id?: string | null
          target_audience?: string[] | null
          title?: string
          trial_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "announcements_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      armbands: {
        Row: {
          armband_number: string
          assigned_at: string | null
          created_at: string | null
          dog_id: string | null
          entry_id: string | null
          id: string
          is_available: boolean | null
          show_id: string
          trial_id: string | null
          version: number
        }
        Insert: {
          armband_number: string
          assigned_at?: string | null
          created_at?: string | null
          dog_id?: string | null
          entry_id?: string | null
          id?: string
          is_available?: boolean | null
          show_id: string
          trial_id?: string | null
          version?: number
        }
        Update: {
          armband_number?: string
          assigned_at?: string | null
          created_at?: string | null
          dog_id?: string | null
          entry_id?: string | null
          id?: string
          is_available?: boolean | null
          show_id?: string
          trial_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "armbands_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "armbands_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "armbands_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      chatbot_feedback: {
        Row: {
          ai_response: string | null
          created_at: string | null
          id: string
          license_key: string | null
          query_log_id: string | null
          question: string | null
          rating: number | null
          report_text: string | null
          show_id: number | null
          tools_used: string[] | null
          user_id: string | null
        }
        Insert: {
          ai_response?: string | null
          created_at?: string | null
          id?: string
          license_key?: string | null
          query_log_id?: string | null
          question?: string | null
          rating?: number | null
          report_text?: string | null
          show_id?: number | null
          tools_used?: string[] | null
          user_id?: string | null
        }
        Update: {
          ai_response?: string | null
          created_at?: string | null
          id?: string
          license_key?: string | null
          query_log_id?: string | null
          question?: string | null
          rating?: number | null
          report_text?: string | null
          show_id?: number | null
          tools_used?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_feedback_query_log_id_fkey"
            columns: ["query_log_id"]
            isOneToOne: false
            referencedRelation: "chatbot_query_log"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_query_log: {
        Row: {
          app_source: string
          created_at: string | null
          id: string
          license_key: string | null
          organization_code: string | null
          query: string
          response_time_ms: number | null
          sport_code: string | null
          tools_used: string[] | null
          user_id: string | null
        }
        Insert: {
          app_source?: string
          created_at?: string | null
          id?: string
          license_key?: string | null
          organization_code?: string | null
          query: string
          response_time_ms?: number | null
          sport_code?: string | null
          tools_used?: string[] | null
          user_id?: string | null
        }
        Update: {
          app_source?: string
          created_at?: string | null
          id?: string
          license_key?: string | null
          organization_code?: string | null
          query?: string
          response_time_ms?: number | null
          sport_code?: string | null
          tools_used?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      class_visibility_overrides: {
        Row: {
          class_id: string
          faults_timing: string | null
          placement_timing: string | null
          preset: string | null
          qualification_timing: string | null
          self_checkin_enabled: boolean | null
          time_timing: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          class_id: string
          faults_timing?: string | null
          placement_timing?: string | null
          preset?: string | null
          qualification_timing?: string | null
          self_checkin_enabled?: boolean | null
          time_timing?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          class_id?: string
          faults_timing?: string | null
          placement_timing?: string | null
          preset?: string | null
          qualification_timing?: string | null
          self_checkin_enabled?: boolean | null
          time_timing?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_visibility_overrides_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_visibility_overrides_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "class_visibility_overrides_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "class_visibility_overrides_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "class_visibility_overrides_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
        ]
      }
      classes: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          age_max: number | null
          age_min: number | null
          allow_waitlist: boolean | null
          breed_restrictions: string[] | null
          checked_in_count: number | null
          class_number: string | null
          competition_type: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          display_order: number | null
          distraction_count: number | null
          dogs_ahead_notification_count: number | null
          element: string | null
          entry_fee: number | null
          estimated_duration: number | null
          handler_age_max: number | null
          handler_age_min: number | null
          has_blank: boolean | null
          height_max: number | null
          height_min: number | null
          hides_known: boolean | null
          id: string
          is_results_reviewed: boolean | null
          is_scoring_finalized: boolean | null
          judge_name: string | null
          jump_heights: string[] | null
          level: string | null
          max_dogs_per_handler: number | null
          max_entries: number | null
          max_faults: number | null
          name: string
          num_areas: number | null
          num_hides: number | null
          qualifying_threshold: number | null
          reopened_after_closeout_at: string | null
          results_released_at: string | null
          results_released_by: string | null
          revised_expected_start: string | null
          scored_count: number | null
          section: string | null
          start_time: string | null
          status: string | null
          status_source: string
          time_limit_area2_seconds: number | null
          time_limit_area3_seconds: number | null
          time_limit_seconds: number | null
          timer_mode: string | null
          total_entries_count: number | null
          trial_id: string
          updated_at: string | null
          version: number
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          age_max?: number | null
          age_min?: number | null
          allow_waitlist?: boolean | null
          breed_restrictions?: string[] | null
          checked_in_count?: number | null
          class_number?: string | null
          competition_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number | null
          distraction_count?: number | null
          dogs_ahead_notification_count?: number | null
          element?: string | null
          entry_fee?: number | null
          estimated_duration?: number | null
          handler_age_max?: number | null
          handler_age_min?: number | null
          has_blank?: boolean | null
          height_max?: number | null
          height_min?: number | null
          hides_known?: boolean | null
          id?: string
          is_results_reviewed?: boolean | null
          is_scoring_finalized?: boolean | null
          judge_name?: string | null
          jump_heights?: string[] | null
          level?: string | null
          max_dogs_per_handler?: number | null
          max_entries?: number | null
          max_faults?: number | null
          name: string
          num_areas?: number | null
          num_hides?: number | null
          qualifying_threshold?: number | null
          reopened_after_closeout_at?: string | null
          results_released_at?: string | null
          results_released_by?: string | null
          revised_expected_start?: string | null
          scored_count?: number | null
          section?: string | null
          start_time?: string | null
          status?: string | null
          status_source?: string
          time_limit_area2_seconds?: number | null
          time_limit_area3_seconds?: number | null
          time_limit_seconds?: number | null
          timer_mode?: string | null
          total_entries_count?: number | null
          trial_id: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          age_max?: number | null
          age_min?: number | null
          allow_waitlist?: boolean | null
          breed_restrictions?: string[] | null
          checked_in_count?: number | null
          class_number?: string | null
          competition_type?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number | null
          distraction_count?: number | null
          dogs_ahead_notification_count?: number | null
          element?: string | null
          entry_fee?: number | null
          estimated_duration?: number | null
          handler_age_max?: number | null
          handler_age_min?: number | null
          has_blank?: boolean | null
          height_max?: number | null
          height_min?: number | null
          hides_known?: boolean | null
          id?: string
          is_results_reviewed?: boolean | null
          is_scoring_finalized?: boolean | null
          judge_name?: string | null
          jump_heights?: string[] | null
          level?: string | null
          max_dogs_per_handler?: number | null
          max_entries?: number | null
          max_faults?: number | null
          name?: string
          num_areas?: number | null
          num_hides?: number | null
          qualifying_threshold?: number | null
          reopened_after_closeout_at?: string | null
          results_released_at?: string | null
          results_released_by?: string | null
          revised_expected_start?: string | null
          scored_count?: number | null
          section?: string | null
          start_time?: string | null
          status?: string | null
          status_source?: string
          time_limit_area2_seconds?: number | null
          time_limit_area3_seconds?: number | null
          time_limit_seconds?: number | null
          timer_mode?: string | null
          total_entries_count?: number | null
          trial_id?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      club_access_requests: {
        Row: {
          approved_club_id: string | null
          created_at: string
          id: string
          request_note: string | null
          requested_club_name: string
          requested_club_website: string | null
          requester_auth_user_id: string
          requester_person_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_club_id?: string | null
          created_at?: string
          id?: string
          request_note?: string | null
          requested_club_name: string
          requested_club_website?: string | null
          requester_auth_user_id: string
          requester_person_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_club_id?: string | null
          created_at?: string
          id?: string
          request_note?: string | null
          requested_club_name?: string
          requested_club_website?: string | null
          requester_auth_user_id?: string
          requester_person_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_access_requests_approved_club_id_fkey"
            columns: ["approved_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_access_requests_requester_person_id_fkey"
            columns: ["requester_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          created_at: string
          dues_paid_through: string | null
          id: string
          joined_date: string | null
          membership_status: string
          membership_type: string
          notes: string | null
          person_id: string
          updated_at: string
          voting_eligible: boolean
        }
        Insert: {
          club_id: string
          created_at?: string
          dues_paid_through?: string | null
          id?: string
          joined_date?: string | null
          membership_status?: string
          membership_type?: string
          notes?: string | null
          person_id: string
          updated_at?: string
          voting_eligible?: boolean
        }
        Update: {
          club_id?: string
          created_at?: string
          dues_paid_through?: string | null
          id?: string
          joined_date?: string | null
          membership_status?: string
          membership_type?: string
          notes?: string | null
          person_id?: string
          updated_at?: string
          voting_eligible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      club_officers: {
        Row: {
          club_id: string
          created_at: string
          elected_date: string | null
          id: string
          person_id: string
          position: string
          term_end: string | null
          term_start: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          elected_date?: string | null
          id?: string
          person_id: string
          position: string
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          elected_date?: string | null
          id?: string
          person_id?: string
          position?: string
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_officers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_officers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      club_premium_templates: {
        Row: {
          accommodations: Json
          additional_notes: string | null
          awards_description: string | null
          club_id: string
          cover_image_url: string | null
          created_at: string
          hospitality_notes: string | null
          id: string
          is_default: boolean
          name: string
          style: string
          trial_type: string | null
          updated_at: string
          vet_clinic_address: string | null
          vet_clinic_name: string | null
          vet_clinic_phone: string | null
        }
        Insert: {
          accommodations?: Json
          additional_notes?: string | null
          awards_description?: string | null
          club_id: string
          cover_image_url?: string | null
          created_at?: string
          hospitality_notes?: string | null
          id?: string
          is_default?: boolean
          name: string
          style?: string
          trial_type?: string | null
          updated_at?: string
          vet_clinic_address?: string | null
          vet_clinic_name?: string | null
          vet_clinic_phone?: string | null
        }
        Update: {
          accommodations?: Json
          additional_notes?: string | null
          awards_description?: string | null
          club_id?: string
          cover_image_url?: string | null
          created_at?: string
          hospitality_notes?: string | null
          id?: string
          is_default?: boolean
          name?: string
          style?: string
          trial_type?: string | null
          updated_at?: string
          vet_clinic_address?: string | null
          vet_clinic_name?: string | null
          vet_clinic_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_premium_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_stripe_accounts: {
        Row: {
          club_id: string
          created_at: string
          id: string
          livemode: boolean
          onboarding_complete: boolean
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          livemode?: boolean
          onboarding_complete?: boolean
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          livemode?: boolean
          onboarding_complete?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_stripe_accounts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          accent_color: string | null
          address: string | null
          city: string | null
          club_number: string | null
          cover_image_url: string | null
          created_at: string | null
          default_withdrawal_cutoff_date: string | null
          default_withdrawal_policy_notes: string | null
          default_withdrawal_retention_type: string | null
          default_withdrawal_retention_value: number | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          email: string | null
          id: string
          license_key: string | null
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string | null
          version: number
          website: string | null
          zip_code: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          city?: string | null
          club_number?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          default_withdrawal_cutoff_date?: string | null
          default_withdrawal_policy_notes?: string | null
          default_withdrawal_retention_type?: string | null
          default_withdrawal_retention_value?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          license_key?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          version?: number
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          city?: string | null
          club_number?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          default_withdrawal_cutoff_date?: string | null
          default_withdrawal_policy_notes?: string | null
          default_withdrawal_retention_type?: string | null
          default_withdrawal_retention_value?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          license_key?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          version?: number
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      dog_favorites: {
        Row: {
          armband: number
          created_at: string
          id: string
          show_id: string
          user_id: string
        }
        Insert: {
          armband: number
          created_at?: string
          id?: string
          show_id: string
          user_id: string
        }
        Update: {
          armband?: number
          created_at?: string
          id?: string
          show_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "dog_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      dog_registrations: {
        Row: {
          application_number: string | null
          breed: string | null
          certificate: string | null
          created_at: string | null
          dog_deleted_at: string | null
          dog_id: string
          id: string
          is_primary: boolean
          organization: string
          registered_name: string | null
          registration_date: string | null
          registration_number: string
          status: string | null
          submission_date: string | null
          updated_at: string | null
          variety: string | null
          verified: boolean | null
        }
        Insert: {
          application_number?: string | null
          breed?: string | null
          certificate?: string | null
          created_at?: string | null
          dog_deleted_at?: string | null
          dog_id: string
          id?: string
          is_primary?: boolean
          organization: string
          registered_name?: string | null
          registration_date?: string | null
          registration_number: string
          status?: string | null
          submission_date?: string | null
          updated_at?: string | null
          variety?: string | null
          verified?: boolean | null
        }
        Update: {
          application_number?: string | null
          breed?: string | null
          certificate?: string | null
          created_at?: string | null
          dog_deleted_at?: string | null
          dog_id?: string
          id?: string
          is_primary?: boolean
          organization?: string
          registered_name?: string | null
          registration_date?: string | null
          registration_number?: string
          status?: string | null
          submission_date?: string | null
          updated_at?: string | null
          variety?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "dog_registrations_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      dogs: {
        Row: {
          breed: string
          breeder_id: string | null
          call_name: string
          co_owner_id: string | null
          color: string | null
          created_at: string | null
          date_of_birth: string | null
          deceased: boolean | null
          deceased_date: string | null
          deleted_at: string | null
          deleted_by: string | null
          height: string | null
          id: string
          image_url: string | null
          license_key: string | null
          microchip_number: string | null
          name: string | null
          owner_id: string | null
          sex: string | null
          spayed_neutered: boolean | null
          status: string | null
          updated_at: string | null
          version: number
          weight: string | null
        }
        Insert: {
          breed: string
          breeder_id?: string | null
          call_name: string
          co_owner_id?: string | null
          color?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deceased?: boolean | null
          deceased_date?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          height?: string | null
          id?: string
          image_url?: string | null
          license_key?: string | null
          microchip_number?: string | null
          name?: string | null
          owner_id?: string | null
          sex?: string | null
          spayed_neutered?: boolean | null
          status?: string | null
          updated_at?: string | null
          version?: number
          weight?: string | null
        }
        Update: {
          breed?: string
          breeder_id?: string | null
          call_name?: string
          co_owner_id?: string | null
          color?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deceased?: boolean | null
          deceased_date?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          height?: string | null
          id?: string
          image_url?: string | null
          license_key?: string | null
          microchip_number?: string | null
          name?: string | null
          owner_id?: string | null
          sex?: string | null
          spayed_neutered?: boolean | null
          status?: string | null
          updated_at?: string | null
          version?: number
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dogs_breeder_id_fkey"
            columns: ["breeder_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_co_owner_id_fkey"
            columns: ["co_owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          email_type: string
          error_message: string | null
          id: string
          recipient_email: string
          related_id: string | null
          resend_message_id: string | null
          status: string
          status_updated_at: string | null
        }
        Insert: {
          created_at?: string
          email_type: string
          error_message?: string | null
          id?: string
          recipient_email: string
          related_id?: string | null
          resend_message_id?: string | null
          status?: string
          status_updated_at?: string | null
        }
        Update: {
          created_at?: string
          email_type?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          related_id?: string | null
          resend_message_id?: string | null
          status?: string
          status_updated_at?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          check_number: string | null
          confirmation_number: string
          created_at: string
          discount_amount: number | null
          group_reference: string | null
          handler_id: string
          id: string
          notes: string | null
          paid_amount: number
          payment_date: string | null
          payment_method: string | null
          payment_notes: string | null
          payment_reference: string | null
          payment_status: string
          refund_amount: number | null
          refund_notes: string | null
          refunded_at: string | null
          show_id: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          check_number?: string | null
          confirmation_number?: string
          created_at?: string
          discount_amount?: number | null
          group_reference?: string | null
          handler_id: string
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_status?: string
          refund_amount?: number | null
          refund_notes?: string | null
          refunded_at?: string | null
          show_id: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          check_number?: string | null
          confirmation_number?: string
          created_at?: string
          discount_amount?: number | null
          group_reference?: string | null
          handler_id?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_status?: string
          refund_amount?: number | null
          refund_notes?: string | null
          refunded_at?: string | null
          show_id?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      entries: {
        Row: {
          area1_correct: number | null
          area1_faults: number | null
          area1_incorrect: number | null
          area1_time_seconds: number | null
          area2_correct: number | null
          area2_faults: number | null
          area2_incorrect: number | null
          area2_time_seconds: number | null
          area3_correct: number | null
          area3_faults: number | null
          area3_incorrect: number | null
          area3_time_seconds: number | null
          area4_time_seconds: number | null
          armband: string | null
          bonus_points: number | null
          capacity_override: boolean
          check_in_status: string | null
          class_id: string | null
          comped: boolean | null
          comped_reason: string | null
          confirmation_email_message_id: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_status: string
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number | null
          disqualification_reason: string | null
          dog_id: string | null
          entry_fee: number | null
          entry_source: string
          entry_status: string | null
          final_placement: number | null
          handler: string | null
          handler_id: string | null
          has_video_review: boolean | null
          id: string
          is_day_of_show: boolean | null
          is_in_ring: boolean | null
          is_scored: boolean | null
          judge_notes: string | null
          judge_signature: string | null
          judge_signature_timestamp: string | null
          jump_height: string | null
          last_synced_at: string | null
          license_key: string | null
          local_id: string | null
          move_up_requested: boolean | null
          no_finish_count: number | null
          payment_method: string | null
          payment_status: string | null
          penalty_points: number | null
          points_earned: number | null
          points_possible: number | null
          preferred_judge: string | null
          promo_code_id: string | null
          refund_amount: number | null
          refund_decided_at: string | null
          refund_decided_by: string | null
          refund_decision: string | null
          refund_notes: string | null
          refunded_at: string | null
          registration_id: string | null
          result_status: string | null
          ring_entry_time: string | null
          ring_exit_time: string | null
          run_order: number | null
          scoring_completed_at: string | null
          scoring_started_at: string | null
          search_time_seconds: number | null
          show_id: string | null
          special_requests: string | null
          stripe_payment_intent_id: string | null
          submitted_at: string | null
          sync_version: number | null
          time_limit_exceeded_seconds: number | null
          time_over_limit: boolean | null
          total_correct_finds: number | null
          total_faults: number | null
          total_incorrect_finds: number | null
          total_score: number | null
          trial_id: string | null
          updated_at: string | null
          version: number
          video_review_notes: string | null
          withdrawal_policy_snapshot: Json | null
          withdrawal_reason: string | null
          withdrawn_at: string | null
        }
        Insert: {
          area1_correct?: number | null
          area1_faults?: number | null
          area1_incorrect?: number | null
          area1_time_seconds?: number | null
          area2_correct?: number | null
          area2_faults?: number | null
          area2_incorrect?: number | null
          area2_time_seconds?: number | null
          area3_correct?: number | null
          area3_faults?: number | null
          area3_incorrect?: number | null
          area3_time_seconds?: number | null
          area4_time_seconds?: number | null
          armband?: string | null
          bonus_points?: number | null
          capacity_override?: boolean
          check_in_status?: string | null
          class_id?: string | null
          comped?: boolean | null
          comped_reason?: string | null
          confirmation_email_message_id?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          disqualification_reason?: string | null
          dog_id?: string | null
          entry_fee?: number | null
          entry_source?: string
          entry_status?: string | null
          final_placement?: number | null
          handler?: string | null
          handler_id?: string | null
          has_video_review?: boolean | null
          id?: string
          is_day_of_show?: boolean | null
          is_in_ring?: boolean | null
          is_scored?: boolean | null
          judge_notes?: string | null
          judge_signature?: string | null
          judge_signature_timestamp?: string | null
          jump_height?: string | null
          last_synced_at?: string | null
          license_key?: string | null
          local_id?: string | null
          move_up_requested?: boolean | null
          no_finish_count?: number | null
          payment_method?: string | null
          payment_status?: string | null
          penalty_points?: number | null
          points_earned?: number | null
          points_possible?: number | null
          preferred_judge?: string | null
          promo_code_id?: string | null
          refund_amount?: number | null
          refund_decided_at?: string | null
          refund_decided_by?: string | null
          refund_decision?: string | null
          refund_notes?: string | null
          refunded_at?: string | null
          registration_id?: string | null
          result_status?: string | null
          ring_entry_time?: string | null
          ring_exit_time?: string | null
          run_order?: number | null
          scoring_completed_at?: string | null
          scoring_started_at?: string | null
          search_time_seconds?: number | null
          show_id?: string | null
          special_requests?: string | null
          stripe_payment_intent_id?: string | null
          submitted_at?: string | null
          sync_version?: number | null
          time_limit_exceeded_seconds?: number | null
          time_over_limit?: boolean | null
          total_correct_finds?: number | null
          total_faults?: number | null
          total_incorrect_finds?: number | null
          total_score?: number | null
          trial_id?: string | null
          updated_at?: string | null
          version?: number
          video_review_notes?: string | null
          withdrawal_policy_snapshot?: Json | null
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          area1_correct?: number | null
          area1_faults?: number | null
          area1_incorrect?: number | null
          area1_time_seconds?: number | null
          area2_correct?: number | null
          area2_faults?: number | null
          area2_incorrect?: number | null
          area2_time_seconds?: number | null
          area3_correct?: number | null
          area3_faults?: number | null
          area3_incorrect?: number | null
          area3_time_seconds?: number | null
          area4_time_seconds?: number | null
          armband?: string | null
          bonus_points?: number | null
          capacity_override?: boolean
          check_in_status?: string | null
          class_id?: string | null
          comped?: boolean | null
          comped_reason?: string | null
          confirmation_email_message_id?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          disqualification_reason?: string | null
          dog_id?: string | null
          entry_fee?: number | null
          entry_source?: string
          entry_status?: string | null
          final_placement?: number | null
          handler?: string | null
          handler_id?: string | null
          has_video_review?: boolean | null
          id?: string
          is_day_of_show?: boolean | null
          is_in_ring?: boolean | null
          is_scored?: boolean | null
          judge_notes?: string | null
          judge_signature?: string | null
          judge_signature_timestamp?: string | null
          jump_height?: string | null
          last_synced_at?: string | null
          license_key?: string | null
          local_id?: string | null
          move_up_requested?: boolean | null
          no_finish_count?: number | null
          payment_method?: string | null
          payment_status?: string | null
          penalty_points?: number | null
          points_earned?: number | null
          points_possible?: number | null
          preferred_judge?: string | null
          promo_code_id?: string | null
          refund_amount?: number | null
          refund_decided_at?: string | null
          refund_decided_by?: string | null
          refund_decision?: string | null
          refund_notes?: string | null
          refunded_at?: string | null
          registration_id?: string | null
          result_status?: string | null
          ring_entry_time?: string | null
          ring_exit_time?: string | null
          run_order?: number | null
          scoring_completed_at?: string | null
          scoring_started_at?: string | null
          search_time_seconds?: number | null
          show_id?: string | null
          special_requests?: string | null
          stripe_payment_intent_id?: string | null
          submitted_at?: string | null
          sync_version?: number | null
          time_limit_exceeded_seconds?: number | null
          time_over_limit?: boolean | null
          total_correct_finds?: number | null
          total_faults?: number | null
          total_incorrect_finds?: number | null
          total_score?: number | null
          trial_id?: string | null
          updated_at?: string | null
          version?: number
          video_review_notes?: string | null
          withdrawal_policy_snapshot?: Json | null
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      entry_cart_items: {
        Row: {
          cart_id: string
          class_id: string
          created_at: string | null
          dog_id: string
          entry_fee_cents: number
          handler_id: string | null
          id: string
          jump_height: string | null
          special_requests: string | null
        }
        Insert: {
          cart_id: string
          class_id: string
          created_at?: string | null
          dog_id: string
          entry_fee_cents: number
          handler_id?: string | null
          id?: string
          jump_height?: string | null
          special_requests?: string | null
        }
        Update: {
          cart_id?: string
          class_id?: string
          created_at?: string | null
          dog_id?: string
          entry_fee_cents?: number
          handler_id?: string | null
          id?: string
          jump_height?: string | null
          special_requests?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "entry_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_cart_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_cart_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entry_cart_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entry_cart_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entry_cart_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entry_cart_items_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_cart_items_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_carts: {
        Row: {
          created_at: string | null
          exhibitor_id: string
          expires_at: string | null
          id: string
          platform_fee_cents: number | null
          show_id: string
          status: string | null
          stripe_checkout_session_id: string | null
          subtotal_cents: number | null
          total_cents: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          exhibitor_id: string
          expires_at?: string | null
          id?: string
          platform_fee_cents?: number | null
          show_id: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          subtotal_cents?: number | null
          total_cents?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          exhibitor_id?: string
          expires_at?: string | null
          id?: string
          platform_fee_cents?: number | null
          show_id?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          subtotal_cents?: number | null
          total_cents?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_carts_exhibitor_id_fkey"
            columns: ["exhibitor_id"]
            isOneToOne: false
            referencedRelation: "exhibitor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_carts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      entry_payment_links: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          entry_ids: string[]
          id: string
          show_id: string
          status: string
          stripe_checkout_session_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          entry_ids: string[]
          id?: string
          show_id: string
          status?: string
          stripe_checkout_session_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          entry_ids?: string[]
          id?: string
          show_id?: string
          status?: string
          stripe_checkout_session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entry_payment_links_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      entry_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          entry_id: string
          id: string
          new_status: string
          previous_status: string | null
          reason: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          entry_id: string
          id?: string
          new_status: string
          previous_status?: string | null
          reason?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          entry_id?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      entry_submissions: {
        Row: {
          created_at: string
          id: string
          result: Json
        }
        Insert: {
          created_at?: string
          id: string
          result: Json
        }
        Update: {
          created_at?: string
          id?: string
          result?: Json
        }
        Relationships: []
      }
      exhibitor_profiles: {
        Row: {
          auth_user_id: string
          created_at: string | null
          default_handler_id: string | null
          id: string
          onboarding_completed_at: string | null
          person_id: string
          stripe_customer_id: string | null
          subscription_expires_at: string | null
          subscription_tier: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          default_handler_id?: string | null
          id?: string
          onboarding_completed_at?: string | null
          person_id: string
          stripe_customer_id?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          default_handler_id?: string | null
          id?: string
          onboarding_completed_at?: string | null
          person_id?: string
          stripe_customer_id?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exhibitor_profiles_default_handler_id_fkey"
            columns: ["default_handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exhibitor_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      fcm_tokens: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          device_name: string | null
          device_type: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          device_name?: string | null
          device_type?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          device_name?: string | null
          device_type?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fcm_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      frontend_logs: {
        Row: {
          category: string
          created_at: string
          fingerprint: string | null
          id: number
          level: number
          message: string
          metadata: Json | null
          page_url: string | null
          session_id: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          fingerprint?: string | null
          id?: never
          level: number
          message: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          fingerprint?: string | null
          id?: never
          level?: number
          message?: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      genetic_screenings: {
        Row: {
          created_at: string
          dog_id: string
          id: string
          notes: string | null
          owner_id: string
          provider: string
          results: Json
          test_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dog_id: string
          id?: string
          notes?: string | null
          owner_id: string
          provider: string
          results?: Json
          test_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dog_id?: string
          id?: string
          notes?: string | null
          owner_id?: string
          provider?: string
          results?: Json
          test_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "genetic_screenings_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      health_records: {
        Row: {
          attachments: string[] | null
          created_at: string | null
          date: string
          description: string | null
          dog_id: string
          id: string
          record_type: string
          title: string
          updated_at: string | null
          vet_clinic: string | null
          vet_name: string | null
        }
        Insert: {
          attachments?: string[] | null
          created_at?: string | null
          date: string
          description?: string | null
          dog_id: string
          id?: string
          record_type: string
          title: string
          updated_at?: string | null
          vet_clinic?: string | null
          vet_name?: string | null
        }
        Update: {
          attachments?: string[] | null
          created_at?: string | null
          date?: string
          description?: string | null
          dog_id?: string
          id?: string
          record_type?: string
          title?: string
          updated_at?: string | null
          vet_clinic?: string | null
          vet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_records_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_assignments: {
        Row: {
          class_id: string | null
          confirmed_at: string | null
          created_at: string | null
          day_capacity_override: number | null
          fee: number | null
          id: string
          invited_at: string | null
          notes: string | null
          person_id: string
          show_id: string | null
          status: string | null
          trial_id: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          class_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          day_capacity_override?: number | null
          fee?: number | null
          id?: string
          invited_at?: string | null
          notes?: string | null
          person_id: string
          show_id?: string | null
          status?: string | null
          trial_id?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          class_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          day_capacity_override?: number | null
          fee?: number | null
          id?: string
          invited_at?: string | null
          notes?: string | null
          person_id?: string
          show_id?: string | null
          status?: string | null
          trial_id?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "judge_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "judge_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "judge_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "judge_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "judge_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      judge_availability: {
        Row: {
          availability_status: string | null
          blackout_dates: string[] | null
          created_at: string | null
          end_date: string | null
          id: string
          max_shows_per_month: number | null
          person_id: string
          start_date: string | null
          travel_radius_miles: number | null
          updated_at: string | null
        }
        Insert: {
          availability_status?: string | null
          blackout_dates?: string[] | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          max_shows_per_month?: number | null
          person_id: string
          start_date?: string | null
          travel_radius_miles?: number | null
          updated_at?: string | null
        }
        Update: {
          availability_status?: string | null
          blackout_dates?: string[] | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          max_shows_per_month?: number | null
          person_id?: string
          start_date?: string | null
          travel_radius_miles?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_availability_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_certifications: {
        Row: {
          certification_date: string | null
          certification_number: string | null
          created_at: string | null
          expiration_date: string | null
          id: string
          is_active: boolean | null
          level: string | null
          organization: string
          person_id: string
          sport: string
          updated_at: string | null
        }
        Insert: {
          certification_date?: string | null
          certification_number?: string | null
          created_at?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          organization: string
          person_id: string
          sport: string
          updated_at?: string | null
        }
        Update: {
          certification_date?: string | null
          certification_number?: string | null
          created_at?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          level?: string | null
          organization?: string
          person_id?: string
          sport?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_certifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_qualifications: {
        Row: {
          approval_number: string | null
          approved_by: string | null
          created_at: string | null
          date_obtained: string | null
          disciplines: string[] | null
          expiration_date: string | null
          id: string
          is_active: boolean | null
          judge_number: string | null
          notes: string | null
          organization: string
          person_id: string
          qualification_level: string
          suspension_date: string | null
          suspension_reason: string | null
          updated_at: string | null
        }
        Insert: {
          approval_number?: string | null
          approved_by?: string | null
          created_at?: string | null
          date_obtained?: string | null
          disciplines?: string[] | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          judge_number?: string | null
          notes?: string | null
          organization: string
          person_id: string
          qualification_level: string
          suspension_date?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_number?: string | null
          approved_by?: string | null
          created_at?: string | null
          date_obtained?: string | null
          disciplines?: string[] | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          judge_number?: string | null
          notes?: string | null
          organization?: string
          person_id?: string
          qualification_level?: string
          suspension_date?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_qualifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          id: string
          ip_address: string
          license_key: string | null
          passcode_prefix: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address: string
          license_key?: string | null
          passcode_prefix?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string
          license_key?: string | null
          passcode_prefix?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      manual_results: {
        Row: {
          created_at: string
          dog_id: string
          element: string
          id: string
          judge: string | null
          level: string
          location: string | null
          notes: string | null
          organization: string
          owner_id: string
          placement: number | null
          points_earned: number | null
          result_status: string
          search_time_seconds: number | null
          section: string | null
          show_name: string
          source: string
          sport_template_id: string | null
          trial_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dog_id: string
          element: string
          id?: string
          judge?: string | null
          level: string
          location?: string | null
          notes?: string | null
          organization: string
          owner_id: string
          placement?: number | null
          points_earned?: number | null
          result_status?: string
          search_time_seconds?: number | null
          section?: string | null
          show_name: string
          source?: string
          sport_template_id?: string | null
          trial_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dog_id?: string
          element?: string
          id?: string
          judge?: string | null
          level?: string
          location?: string | null
          notes?: string | null
          organization?: string
          owner_id?: string
          placement?: number | null
          points_earned?: number | null
          result_status?: string
          search_time_seconds?: number | null
          section?: string | null
          show_name?: string
          source?: string
          sport_template_id?: string | null
          trial_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_results_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_results_sport_template_id_fkey"
            columns: ["sport_template_id"]
            isOneToOne: false
            referencedRelation: "sport_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string | null
          dog_id: string
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          is_active: boolean | null
          medication_name: string
          prescribing_vet: string | null
          reason: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dog_id: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          medication_name: string
          prescribing_vet?: string | null
          reason?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dog_id?: string
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          medication_name?: string
          prescribing_vet?: string | null
          reason?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medications_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      nationals_advancement: {
        Row: {
          advanced: boolean | null
          advancement_rank: number | null
          created_at: string | null
          entry_id: string
          from_day: number
          id: string
          license_key: string | null
          to_day: number
        }
        Insert: {
          advanced?: boolean | null
          advancement_rank?: number | null
          created_at?: string | null
          entry_id: string
          from_day: number
          id?: string
          license_key?: string | null
          to_day: number
        }
        Update: {
          advanced?: boolean | null
          advancement_rank?: number | null
          created_at?: string | null
          entry_id?: string
          from_day?: number
          id?: string
          license_key?: string | null
          to_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_advancement_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      nationals_rankings: {
        Row: {
          created_at: string | null
          current_rank: number | null
          elements_completed: number | null
          elimination_reason: string | null
          entry_id: string
          id: string
          is_eliminated: boolean | null
          license_key: string | null
          previous_rank: number | null
          total_points: number | null
          total_time_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_rank?: number | null
          elements_completed?: number | null
          elimination_reason?: string | null
          entry_id: string
          id?: string
          is_eliminated?: boolean | null
          license_key?: string | null
          previous_rank?: number | null
          total_points?: number | null
          total_time_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_rank?: number | null
          elements_completed?: number | null
          elimination_reason?: string | null
          entry_id?: string
          id?: string
          is_eliminated?: boolean | null
          license_key?: string | null
          previous_rank?: number | null
          total_points?: number | null
          total_time_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_rankings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      nationals_scores: {
        Row: {
          competition_day: number
          correct_finds: number | null
          created_at: string | null
          element_type: string
          entry_id: string
          faults: number | null
          id: string
          incorrect_finds: number | null
          is_scored: boolean | null
          license_key: string | null
          no_finish_count: number | null
          points: number | null
          result_status: string | null
          time_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          competition_day: number
          correct_finds?: number | null
          created_at?: string | null
          element_type: string
          entry_id: string
          faults?: number | null
          id?: string
          incorrect_finds?: number | null
          is_scored?: boolean | null
          license_key?: string | null
          no_finish_count?: number | null
          points?: number | null
          result_status?: string | null
          time_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          competition_day?: number
          correct_finds?: number | null
          created_at?: string | null
          element_type?: string
          entry_id?: string
          faults?: number | null
          id?: string
          incorrect_finds?: number | null
          is_scored?: boolean | null
          license_key?: string | null
          no_finish_count?: number | null
          points?: number | null
          result_status?: string | null
          time_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nationals_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email_enabled: boolean | null
          entry_confirmations: boolean | null
          id: string
          payment_receipts: boolean | null
          promotional: boolean | null
          push_enabled: boolean | null
          results_available: boolean | null
          schedule_changes: boolean | null
          sms_enabled: boolean | null
          upcoming_runs: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email_enabled?: boolean | null
          entry_confirmations?: boolean | null
          id?: string
          payment_receipts?: boolean | null
          promotional?: boolean | null
          push_enabled?: boolean | null
          results_available?: boolean | null
          schedule_changes?: boolean | null
          sms_enabled?: boolean | null
          upcoming_runs?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email_enabled?: boolean | null
          entry_confirmations?: boolean | null
          id?: string
          payment_receipts?: boolean | null
          promotional?: boolean | null
          push_enabled?: boolean | null
          results_available?: boolean | null
          schedule_changes?: boolean | null
          sms_enabled?: boolean | null
          upcoming_runs?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          body: string | null
          channels: string[] | null
          created_at: string | null
          data: Json | null
          error_message: string | null
          id: string
          notification_type: string
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channels?: string[] | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channels?: string[] | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          deep_link_url: string | null
          id: string
          message: string
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deep_link_url?: string | null
          id?: string
          message: string
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          deep_link_url?: string | null
          id?: string
          message?: string
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      ofa_screenings: {
        Row: {
          certification_number: string | null
          created_at: string
          dog_id: string
          id: string
          notes: string | null
          owner_id: string
          result: string | null
          status: string
          test_date: string
          test_type: string
          updated_at: string
          veterinarian: string | null
        }
        Insert: {
          certification_number?: string | null
          created_at?: string
          dog_id: string
          id?: string
          notes?: string | null
          owner_id: string
          result?: string | null
          status?: string
          test_date: string
          test_type: string
          updated_at?: string
          veterinarian?: string | null
        }
        Update: {
          certification_number?: string | null
          created_at?: string
          dog_id?: string
          id?: string
          notes?: string | null
          owner_id?: string
          result?: string | null
          status?: string
          test_date?: string
          test_type?: string
          updated_at?: string
          veterinarian?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ofa_screenings_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_scoring: {
        Row: {
          client_id: string
          conflict_detected: boolean | null
          entry_id: string
          id: string
          resolution: string | null
          scoring_data: Json
          submitted_at: string | null
          synced: boolean | null
          synced_at: string | null
        }
        Insert: {
          client_id: string
          conflict_detected?: boolean | null
          entry_id: string
          id?: string
          resolution?: string | null
          scoring_data: Json
          submitted_at?: string | null
          synced?: boolean | null
          synced_at?: string | null
        }
        Update: {
          client_id?: string
          conflict_detected?: boolean | null
          entry_id?: string
          id?: string
          resolution?: string | null
          scoring_data?: Json
          submitted_at?: string | null
          synced?: boolean | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      onboarding_requests: {
        Row: {
          auth_user_id: string
          club_name: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          first_show_date: string | null
          id: string
          message: string | null
          notes: string | null
          organization: string
          status: string
        }
        Insert: {
          auth_user_id: string
          club_name: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          first_show_date?: string | null
          id?: string
          message?: string | null
          notes?: string | null
          organization: string
          status?: string
        }
        Update: {
          auth_user_id?: string
          club_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          first_show_date?: string | null
          id?: string
          message?: string | null
          notes?: string | null
          organization?: string
          status?: string
        }
        Relationships: []
      }
      operator_alerts: {
        Row: {
          created_at: string
          dedupe_key: string | null
          detail: Json | null
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
          title: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          detail?: Json | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          source: string
          title: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          detail?: Json | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          title?: string
        }
        Relationships: []
      }
      organization_agreements: {
        Row: {
          agreement_text: string
          created_at: string | null
          id: string
          organization: string
          updated_at: string | null
        }
        Insert: {
          agreement_text: string
          created_at?: string | null
          id?: string
          organization: string
          updated_at?: string | null
        }
        Update: {
          agreement_text?: string
          created_at?: string | null
          id?: string
          organization?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      paperwork_prints: {
        Row: {
          class_id: string | null
          coverage: Json
          created_at: string
          fingerprint: string
          id: string
          printed_at: string
          printed_by: string
          printed_by_name: string
          report_id: string
          scope_kind: string
          show_id: string
          trial_id: string | null
          updated_at: string
          version: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          class_id?: string | null
          coverage: Json
          created_at?: string
          fingerprint: string
          id: string
          printed_at: string
          printed_by: string
          printed_by_name: string
          report_id: string
          scope_kind: string
          show_id: string
          trial_id?: string | null
          updated_at?: string
          version?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          class_id?: string | null
          coverage?: Json
          created_at?: string
          fingerprint?: string
          id?: string
          printed_at?: string
          printed_by?: string
          printed_by_name?: string
          report_id?: string
          scope_kind?: string
          show_id?: string
          trial_id?: string | null
          updated_at?: string
          version?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paperwork_prints_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperwork_prints_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "paperwork_prints_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "paperwork_prints_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "paperwork_prints_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "paperwork_prints_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "paperwork_prints_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      pedigree_ancestors: {
        Row: {
          breed: string | null
          call_name: string | null
          color: string | null
          created_at: string
          date_of_birth: string | null
          dog_id: string
          health_info: string | null
          id: string
          linked_dog_id: string | null
          owner_id: string
          photo_url: string | null
          position: string
          registered_name: string
          registration_numbers: Json | null
          sex: string | null
          titles: string | null
          updated_at: string
        }
        Insert: {
          breed?: string | null
          call_name?: string | null
          color?: string | null
          created_at?: string
          date_of_birth?: string | null
          dog_id: string
          health_info?: string | null
          id?: string
          linked_dog_id?: string | null
          owner_id: string
          photo_url?: string | null
          position: string
          registered_name: string
          registration_numbers?: Json | null
          sex?: string | null
          titles?: string | null
          updated_at?: string
        }
        Update: {
          breed?: string | null
          call_name?: string | null
          color?: string | null
          created_at?: string
          date_of_birth?: string | null
          dog_id?: string
          health_info?: string | null
          id?: string
          linked_dog_id?: string | null
          owner_id?: string
          photo_url?: string | null
          position?: string
          registered_name?: string
          registration_numbers?: Json | null
          sex?: string | null
          titles?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedigree_ancestors_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedigree_ancestors_linked_dog_id_fkey"
            columns: ["linked_dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          agreed_to_tos_at: string | null
          auth_user_id: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          license_key: string | null
          phone: string | null
          profile_image: string | null
          state: string | null
          status: string
          street_address: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          agreed_to_tos_at?: string | null
          auth_user_id?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          license_key?: string | null
          phone?: string | null
          profile_image?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          agreed_to_tos_at?: string | null
          auth_user_id?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          license_key?: string | null
          phone?: string | null
          profile_image?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          id: string
          license_key: string | null
          metadata: Json | null
          metric_name: string
          metric_type: string
          metric_value: number | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          id?: string
          license_key?: string | null
          metadata?: Json | null
          metric_name: string
          metric_type: string
          metric_value?: number | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          id?: string
          license_key?: string | null
          metadata?: Json | null
          metric_name?: string
          metric_type?: string
          metric_value?: number | null
        }
        Relationships: []
      }
      permission_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: boolean
          platform_fee_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          platform_fee_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          platform_fee_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_waitlist: {
        Row: {
          access_granted_at: string | null
          access_invite_sent_at: string | null
          beta_invited_at: string | null
          created_at: string
          current_system: string | null
          email: string
          id: string
          ip_address: unknown
          name: string | null
          notes: string | null
          notified_at: string | null
          role: string | null
          source: string
          sports: string[] | null
          switch_reason: string | null
          unsubscribed_at: string | null
          user_agent: string | null
        }
        Insert: {
          access_granted_at?: string | null
          access_invite_sent_at?: string | null
          beta_invited_at?: string | null
          created_at?: string
          current_system?: string | null
          email: string
          id?: string
          ip_address?: unknown
          name?: string | null
          notes?: string | null
          notified_at?: string | null
          role?: string | null
          source: string
          sports?: string[] | null
          switch_reason?: string | null
          unsubscribed_at?: string | null
          user_agent?: string | null
        }
        Update: {
          access_granted_at?: string | null
          access_invite_sent_at?: string | null
          beta_invited_at?: string | null
          created_at?: string
          current_system?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          name?: string | null
          notes?: string | null
          notified_at?: string | null
          role?: string | null
          source?: string
          sports?: string[] | null
          switch_reason?: string | null
          unsubscribed_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      premium_generation_attempts: {
        Row: {
          attempted_at: string
          auth_user_id: string
          id: string
          show_id: string
        }
        Insert: {
          attempted_at?: string
          auth_user_id: string
          id?: string
          show_id: string
        }
        Update: {
          attempted_at?: string
          auth_user_id?: string
          id?: string
          show_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generation_attempts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      premium_generations: {
        Row: {
          club_id: string
          field_overrides: Json
          generated_at: string
          id: string
          narrative_edits: Json
          org: string
          show_id: string
          template_id: string | null
        }
        Insert: {
          club_id: string
          field_overrides?: Json
          generated_at?: string
          id?: string
          narrative_edits?: Json
          org: string
          show_id: string
          template_id?: string | null
        }
        Update: {
          club_id?: string
          field_overrides?: Json
          generated_at?: string
          id?: string
          narrative_edits?: Json
          org?: string
          show_id?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "premium_generations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "premium_generations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "club_premium_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          show_id: string | null
          trial_id: string | null
          updated_at: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          show_id?: string | null
          trial_id?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          show_id?: string | null
          trial_id?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "promo_codes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "promo_codes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      push_notification_queue: {
        Row: {
          attempts: number | null
          body: string | null
          created_at: string | null
          data: Json | null
          error_message: string | null
          id: string
          max_attempts: number | null
          priority: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          subscription_id: string | null
          title: string
        }
        Insert: {
          attempts?: number | null
          body?: string | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          priority?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subscription_id?: string | null
          title: string
        }
        Update: {
          attempts?: number | null
          body?: string | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          priority?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subscription_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_queue_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string | null
          endpoint: string
          id: string
          license_key: string | null
          p256dh: string | null
          user_id: string | null
        }
        Insert: {
          auth?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          license_key?: string | null
          p256dh?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          license_key?: string | null
          p256dh?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      result_submissions: {
        Row: {
          id: string
          organization: string
          show_id: string
          sport_type: string
          status: string
          submitted_at: string
          submitted_by: string | null
          trial_id: string | null
          xml_payload: string | null
        }
        Insert: {
          id?: string
          organization: string
          show_id: string
          sport_type: string
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          trial_id?: string | null
          xml_payload?: string | null
        }
        Update: {
          id?: string
          organization?: string
          show_id?: string
          sport_type?: string
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          trial_id?: string | null
          xml_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "result_submissions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "result_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "result_submissions_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      ringside_containment: {
        Row: {
          backpressure_ms: number
          calibrated: boolean
          id: boolean
          last_sample_at: string
          last_seq: number
          state: string
          trip_conflict_delta: number | null
          trip_conflicts_per_minute: number
          trip_reason: string | null
          tripped_at: string | null
        }
        Insert: {
          backpressure_ms?: number
          calibrated?: boolean
          id?: boolean
          last_sample_at?: string
          last_seq?: number
          state?: string
          trip_conflict_delta?: number | null
          trip_conflicts_per_minute?: number
          trip_reason?: string | null
          tripped_at?: string | null
        }
        Update: {
          backpressure_ms?: number
          calibrated?: boolean
          id?: boolean
          last_sample_at?: string
          last_seq?: number
          state?: string
          trip_conflict_delta?: number | null
          trip_conflicts_per_minute?: number
          trip_reason?: string | null
          tripped_at?: string | null
        }
        Relationships: []
      }
      ringside_containment_audit: {
        Row: {
          actor: string | null
          conflict_delta: number | null
          event: string
          id: number
          occurred_at: string
          reason: string | null
        }
        Insert: {
          actor?: string | null
          conflict_delta?: number | null
          event: string
          id?: never
          occurred_at?: string
          reason?: string | null
        }
        Update: {
          actor?: string | null
          conflict_delta?: number | null
          event?: string
          id?: never
          occurred_at?: string
          reason?: string | null
        }
        Relationships: []
      }
      ringside_sessions: {
        Row: {
          created_at: string
          favorited_armbands: string[]
          last_seen_at: string | null
          last_seen_route: string | null
          role: string
          show_id: string
          show_passcode_id: string | null
          subscription_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          favorited_armbands?: string[]
          last_seen_at?: string | null
          last_seen_route?: string | null
          role: string
          show_id: string
          show_passcode_id?: string | null
          subscription_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          favorited_armbands?: string[]
          last_seen_at?: string | null
          last_seen_route?: string | null
          role?: string
          show_id?: string
          show_passcode_id?: string | null
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "ringside_sessions_show_passcode_id_fkey"
            columns: ["show_passcode_id"]
            isOneToOne: false
            referencedRelation: "show_passcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ringside_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_requests: {
        Row: {
          auth_user_id: string
          club_id: string | null
          created_at: string
          id: string
          person_id: string
          requested_role: string
          requested_scope: string
          requester_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          show_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          club_id?: string | null
          created_at?: string
          id?: string
          person_id: string
          requested_role: string
          requested_scope?: string
          requester_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          show_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          club_id?: string | null
          created_at?: string
          id?: string
          person_id?: string
          requested_role?: string
          requested_scope?: string
          requester_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          show_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "role_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          permissions: string[] | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          permissions?: string[] | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          permissions?: string[] | null
        }
        Relationships: []
      }
      rule_organizations: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          website: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          website?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      rule_sports: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_sports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "rule_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rulebooks: {
        Row: {
          created_at: string | null
          effective_date: string | null
          id: string
          organization_id: string | null
          source_url: string | null
          sport_id: string | null
          title: string
          version: string | null
        }
        Insert: {
          created_at?: string | null
          effective_date?: string | null
          id?: string
          organization_id?: string | null
          source_url?: string | null
          sport_id?: string | null
          title: string
          version?: string | null
        }
        Update: {
          created_at?: string | null
          effective_date?: string | null
          id?: string
          organization_id?: string | null
          source_url?: string | null
          sport_id?: string | null
          title?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rulebooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "rule_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rulebooks_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "rule_sports"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          keywords: string[] | null
          rule_number: string | null
          rulebook_id: string | null
          section: string | null
          title: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          keywords?: string[] | null
          rule_number?: string | null
          rulebook_id?: string | null
          section?: string | null
          title?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          keywords?: string[] | null
          rule_number?: string | null
          rulebook_id?: string | null
          section?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_rulebook_id_fkey"
            columns: ["rulebook_id"]
            isOneToOne: false
            referencedRelation: "rulebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      rules_feedback: {
        Row: {
          created_at: string | null
          feedback_text: string | null
          helpful: boolean | null
          id: string
          query_log_id: string | null
          rule_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_text?: string | null
          helpful?: boolean | null
          id?: string
          query_log_id?: string | null
          rule_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_text?: string | null
          helpful?: boolean | null
          id?: string
          query_log_id?: string | null
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_feedback_query_log_id_fkey"
            columns: ["query_log_id"]
            isOneToOne: false
            referencedRelation: "rules_query_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_feedback_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      rules_query_log: {
        Row: {
          created_at: string | null
          id: string
          license_key: string | null
          query: string
          response_time_ms: number | null
          results_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          license_key?: string | null
          query: string
          response_time_ms?: number | null
          results_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          license_key?: string | null
          query?: string
          response_time_ms?: number | null
          results_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      secretary_tasks: {
        Row: {
          assignee_id: string | null
          club_id: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          show_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          club_id: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          show_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          club_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          show_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "secretary_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secretary_tasks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secretary_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "secretary_tasks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "show_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      show_announcements: {
        Row: {
          author_id: string
          author_name: string | null
          author_role: string
          content: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          priority: string
          show_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          author_role: string
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          show_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          author_role?: string
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          show_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_announcements_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_incidents: {
        Row: {
          action_taken: string | null
          class_id: string | null
          created_at: string
          created_by: string
          created_by_name: string | null
          description: string | null
          dog_id: string | null
          dog_name: string | null
          entry_id: string | null
          handler_id: string | null
          handler_name: string | null
          id: string
          incident_type: string
          judge_id: string | null
          judge_name: string | null
          occurred_at: string
          severity: string
          show_id: string
          summary: string
          trial_id: string | null
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          class_id?: string | null
          created_at?: string
          created_by: string
          created_by_name?: string | null
          description?: string | null
          dog_id?: string | null
          dog_name?: string | null
          entry_id?: string | null
          handler_id?: string | null
          handler_name?: string | null
          id?: string
          incident_type: string
          judge_id?: string | null
          judge_name?: string | null
          occurred_at?: string
          severity?: string
          show_id: string
          summary: string
          trial_id?: string | null
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          description?: string | null
          dog_id?: string | null
          dog_name?: string | null
          entry_id?: string | null
          handler_id?: string | null
          handler_name?: string | null
          id?: string
          incident_type?: string
          judge_id?: string | null
          judge_name?: string | null
          occurred_at?: string
          severity?: string
          show_id?: string
          summary?: string
          trial_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_incidents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "show_incidents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "show_incidents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "show_incidents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "show_incidents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "show_incidents_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_incidents_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "show_incidents_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      show_lifecycle_email_attempts: {
        Row: {
          attempted_at: string
          attempted_by: string | null
          email_log_id: string | null
          error_message: string | null
          id: string
          job_id: string
          resend_message_id: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          attempted_by?: string | null
          email_log_id?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          resend_message_id?: string | null
          status: string
        }
        Update: {
          attempted_at?: string
          attempted_by?: string | null
          email_log_id?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          resend_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_lifecycle_email_attempts_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "show_lifecycle_email_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      show_lifecycle_email_jobs: {
        Row: {
          batch_key: string | null
          body: string | null
          correction_for_job_id: string | null
          created_at: string
          created_by: string | null
          dismissed_at: string | null
          due_at: string
          email_log_id: string | null
          enrollment_id: string | null
          entry_id: string | null
          id: string
          idempotency_key: string
          prepared_at: string
          preview_warnings: Json
          recipient_email: string | null
          recipient_name: string | null
          recipient_person_id: string | null
          recipient_scope: string
          rendered_body: string | null
          rendered_secretary_note: string | null
          rendered_subject: string | null
          secretary_note: string | null
          sent_at: string | null
          show_id: string
          skipped_at: string | null
          status: string
          step_id: string
          step_type: string
          subject: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_key?: string | null
          body?: string | null
          correction_for_job_id?: string | null
          created_at?: string
          created_by?: string | null
          dismissed_at?: string | null
          due_at?: string
          email_log_id?: string | null
          enrollment_id?: string | null
          entry_id?: string | null
          id?: string
          idempotency_key: string
          prepared_at?: string
          preview_warnings?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_person_id?: string | null
          recipient_scope: string
          rendered_body?: string | null
          rendered_secretary_note?: string | null
          rendered_subject?: string | null
          secretary_note?: string | null
          sent_at?: string | null
          show_id: string
          skipped_at?: string | null
          status?: string
          step_id: string
          step_type: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_key?: string | null
          body?: string | null
          correction_for_job_id?: string | null
          created_at?: string
          created_by?: string | null
          dismissed_at?: string | null
          due_at?: string
          email_log_id?: string | null
          enrollment_id?: string | null
          entry_id?: string | null
          id?: string
          idempotency_key?: string
          prepared_at?: string
          preview_warnings?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_person_id?: string | null
          recipient_scope?: string
          rendered_body?: string | null
          rendered_secretary_note?: string | null
          rendered_subject?: string | null
          secretary_note?: string | null
          sent_at?: string | null
          show_id?: string
          skipped_at?: string | null
          status?: string
          step_id?: string
          step_type?: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_lifecycle_email_jobs_correction_for_job_id_fkey"
            columns: ["correction_for_job_id"]
            isOneToOne: false
            referencedRelation: "show_lifecycle_email_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_recipient_person_id_fkey"
            columns: ["recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_jobs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "show_lifecycle_email_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      show_lifecycle_email_steps: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          show_id: string
          step_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          show_id: string
          step_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          show_id?: string
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_lifecycle_email_steps_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_message_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          participant_id: string
          show_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          participant_id: string
          show_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          participant_id?: string
          show_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_message_threads_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_messages: {
        Row: {
          body: string
          created_at: string
          group_label: string | null
          id: string
          push_alert: boolean
          read_at: string | null
          sender_id: string
          show_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          group_label?: string | null
          id?: string
          push_alert?: boolean
          read_at?: string | null
          sender_id: string
          show_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          group_label?: string | null
          id?: string
          push_alert?: boolean
          read_at?: string | null
          sender_id?: string
          show_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_messages_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "show_message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      show_money_locks: {
        Row: {
          created_at: string
          expires_at: string
          holder: string
          lock_id: string
          show_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          holder: string
          lock_id: string
          show_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          holder?: string
          lock_id?: string
          show_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_money_locks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_passcodes: {
        Row: {
          created_at: string
          id: string
          passcode_ciphertext: string | null
          passcode_hash: string
          role: string
          show_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          passcode_ciphertext?: string | null
          passcode_hash: string
          role: string
          show_id: string
        }
        Update: {
          created_at?: string
          id?: string
          passcode_ciphertext?: string | null
          passcode_hash?: string
          role?: string
          show_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_passcodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_payouts: {
        Row: {
          amount_cents: number
          club_stripe_account_id: string | null
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          scheduled_date: string | null
          show_id: string
          status: string
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          club_stripe_account_id?: string | null
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          scheduled_date?: string | null
          show_id: string
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          club_stripe_account_id?: string | null
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          scheduled_date?: string | null
          show_id?: string
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_payouts_club_stripe_account_id_fkey"
            columns: ["club_stripe_account_id"]
            isOneToOne: false
            referencedRelation: "club_stripe_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_payouts_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      show_templates: {
        Row: {
          club_id: string | null
          created_at: string | null
          created_by: string | null
          default_day_of_show_fee: number | null
          default_entry_period_days: number | null
          default_max_entries_per_dog: number | null
          default_pre_entry_fee: number | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          show_type: string
          template_data: Json | null
          updated_at: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          default_day_of_show_fee?: number | null
          default_entry_period_days?: number | null
          default_max_entries_per_dog?: number | null
          default_pre_entry_fee?: number | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          show_type: string
          template_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          default_day_of_show_fee?: number | null
          default_entry_period_days?: number | null
          default_max_entries_per_dog?: number | null
          default_pre_entry_fee?: number | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          show_type?: string
          template_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      show_visibility_settings: {
        Row: {
          faults_timing: string
          placement_timing: string
          preset: string | null
          qualification_timing: string
          self_checkin_enabled: boolean
          show_id: string
          time_timing: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          faults_timing?: string
          placement_timing?: string
          preset?: string | null
          qualification_timing?: string
          self_checkin_enabled?: boolean
          show_id: string
          time_timing?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          faults_timing?: string
          placement_timing?: string
          preset?: string | null
          qualification_timing?: string
          self_checkin_enabled?: boolean
          show_id?: string
          time_timing?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "show_visibility_settings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      shows: {
        Row: {
          accent_color: string | null
          accept_cash_payments: boolean
          accept_check_payments: boolean
          address: string | null
          allow_non_owner_handlers: boolean | null
          brand_color: string
          cc_secretary_on_exhibitor_emails: boolean
          city: string | null
          club_id: string | null
          confirmation_message: string | null
          cover_image_url: string | null
          created_at: string | null
          day_of_show_fee: number | null
          default_judge_day_capacity: number
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          end_date: string
          entry_close_date: string | null
          entry_open_date: string | null
          experience_is_published: boolean
          experience_published_at: string | null
          experience_published_content: Json
          experience_published_style: string | null
          id: string
          is_nationals: boolean
          latitude: number | null
          license_key: string | null
          location: string | null
          logo_url: string | null
          longitude: number | null
          mail_in_auto_release: boolean
          mail_in_deadline: string | null
          mail_in_release_date: string | null
          mail_in_strategy: string | null
          mail_in_value: number | null
          max_entries_per_dog: number | null
          max_total_entries: number | null
          name: string
          organization: string
          pre_entry_fee: number | null
          published_premium_at: string | null
          published_premium_url: string | null
          results_released_at: string | null
          results_visible_to_all: boolean | null
          secretary_email: string | null
          start_date: string
          starting_armband_number: number
          state: string | null
          status: string | null
          style: string
          updated_at: string | null
          venue_name: string | null
          venue_wifi_network: string | null
          venue_wifi_password: string | null
          version: number
          waitlist_payment_deadline_hours: number
          withdrawal_cutoff_date: string | null
          withdrawal_policy_notes: string | null
          withdrawal_retention_type: string | null
          withdrawal_retention_value: number | null
          zip_code: string | null
        }
        Insert: {
          accent_color?: string | null
          accept_cash_payments?: boolean
          accept_check_payments?: boolean
          address?: string | null
          allow_non_owner_handlers?: boolean | null
          brand_color?: string
          cc_secretary_on_exhibitor_emails?: boolean
          city?: string | null
          club_id?: string | null
          confirmation_message?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          day_of_show_fee?: number | null
          default_judge_day_capacity?: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          end_date: string
          entry_close_date?: string | null
          entry_open_date?: string | null
          experience_is_published?: boolean
          experience_published_at?: string | null
          experience_published_content?: Json
          experience_published_style?: string | null
          id?: string
          is_nationals?: boolean
          latitude?: number | null
          license_key?: string | null
          location?: string | null
          logo_url?: string | null
          longitude?: number | null
          mail_in_auto_release?: boolean
          mail_in_deadline?: string | null
          mail_in_release_date?: string | null
          mail_in_strategy?: string | null
          mail_in_value?: number | null
          max_entries_per_dog?: number | null
          max_total_entries?: number | null
          name: string
          organization: string
          pre_entry_fee?: number | null
          published_premium_at?: string | null
          published_premium_url?: string | null
          results_released_at?: string | null
          results_visible_to_all?: boolean | null
          secretary_email?: string | null
          start_date: string
          starting_armband_number?: number
          state?: string | null
          status?: string | null
          style?: string
          updated_at?: string | null
          venue_name?: string | null
          venue_wifi_network?: string | null
          venue_wifi_password?: string | null
          version?: number
          waitlist_payment_deadline_hours?: number
          withdrawal_cutoff_date?: string | null
          withdrawal_policy_notes?: string | null
          withdrawal_retention_type?: string | null
          withdrawal_retention_value?: number | null
          zip_code?: string | null
        }
        Update: {
          accent_color?: string | null
          accept_cash_payments?: boolean
          accept_check_payments?: boolean
          address?: string | null
          allow_non_owner_handlers?: boolean | null
          brand_color?: string
          cc_secretary_on_exhibitor_emails?: boolean
          city?: string | null
          club_id?: string | null
          confirmation_message?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          day_of_show_fee?: number | null
          default_judge_day_capacity?: number
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          end_date?: string
          entry_close_date?: string | null
          entry_open_date?: string | null
          experience_is_published?: boolean
          experience_published_at?: string | null
          experience_published_content?: Json
          experience_published_style?: string | null
          id?: string
          is_nationals?: boolean
          latitude?: number | null
          license_key?: string | null
          location?: string | null
          logo_url?: string | null
          longitude?: number | null
          mail_in_auto_release?: boolean
          mail_in_deadline?: string | null
          mail_in_release_date?: string | null
          mail_in_strategy?: string | null
          mail_in_value?: number | null
          max_entries_per_dog?: number | null
          max_total_entries?: number | null
          name?: string
          organization?: string
          pre_entry_fee?: number | null
          published_premium_at?: string | null
          published_premium_url?: string | null
          results_released_at?: string | null
          results_visible_to_all?: boolean | null
          secretary_email?: string | null
          start_date?: string
          starting_armband_number?: number
          state?: string | null
          status?: string | null
          style?: string
          updated_at?: string | null
          venue_name?: string | null
          venue_wifi_network?: string | null
          venue_wifi_password?: string | null
          version?: number
          waitlist_payment_deadline_hours?: number
          withdrawal_cutoff_date?: string | null
          withdrawal_policy_notes?: string | null
          withdrawal_retention_type?: string | null
          withdrawal_retention_value?: number | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shows_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_class_rules: {
        Row: {
          area_count: number | null
          class_name: string
          created_at: string | null
          default_entry_fee: number | null
          display_order: number | null
          distraction_count_max: number | null
          distraction_count_min: number | null
          element: string
          field_overrides: Json | null
          has_30_second_warning: boolean | null
          has_blank: boolean | null
          hide_count_fixed: number | null
          hide_count_max: number | null
          hide_count_min: number | null
          hides_known: boolean | null
          id: string
          level: string | null
          max_time_seconds_area2: number | null
          max_time_seconds_area3: number | null
          max_time_seconds_fixed: number | null
          max_time_seconds_max: number | null
          max_time_seconds_min: number | null
          mrv_minutes: number | null
          odors: string[] | null
          section: string | null
          sport_template_id: string
          time_type: string | null
          timer_mode: string | null
          updated_at: string | null
          warning_notes: string | null
        }
        Insert: {
          area_count?: number | null
          class_name: string
          created_at?: string | null
          default_entry_fee?: number | null
          display_order?: number | null
          distraction_count_max?: number | null
          distraction_count_min?: number | null
          element: string
          field_overrides?: Json | null
          has_30_second_warning?: boolean | null
          has_blank?: boolean | null
          hide_count_fixed?: number | null
          hide_count_max?: number | null
          hide_count_min?: number | null
          hides_known?: boolean | null
          id?: string
          level?: string | null
          max_time_seconds_area2?: number | null
          max_time_seconds_area3?: number | null
          max_time_seconds_fixed?: number | null
          max_time_seconds_max?: number | null
          max_time_seconds_min?: number | null
          mrv_minutes?: number | null
          odors?: string[] | null
          section?: string | null
          sport_template_id: string
          time_type?: string | null
          timer_mode?: string | null
          updated_at?: string | null
          warning_notes?: string | null
        }
        Update: {
          area_count?: number | null
          class_name?: string
          created_at?: string | null
          default_entry_fee?: number | null
          display_order?: number | null
          distraction_count_max?: number | null
          distraction_count_min?: number | null
          element?: string
          field_overrides?: Json | null
          has_30_second_warning?: boolean | null
          has_blank?: boolean | null
          hide_count_fixed?: number | null
          hide_count_max?: number | null
          hide_count_min?: number | null
          hides_known?: boolean | null
          id?: string
          level?: string | null
          max_time_seconds_area2?: number | null
          max_time_seconds_area3?: number | null
          max_time_seconds_fixed?: number | null
          max_time_seconds_max?: number | null
          max_time_seconds_min?: number | null
          mrv_minutes?: number | null
          odors?: string[] | null
          section?: string | null
          sport_template_id?: string
          time_type?: string | null
          timer_mode?: string | null
          updated_at?: string | null
          warning_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sport_class_rules_sport_template_id_fkey"
            columns: ["sport_template_id"]
            isOneToOne: false
            referencedRelation: "sport_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_templates: {
        Row: {
          created_at: string | null
          divisions: string[] | null
          elements: string[]
          export_config: Json | null
          id: string
          is_active: boolean | null
          levels: string[]
          operational_config: Json | null
          organization: string
          section_mode: string
          sport_code: string
          sport_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          divisions?: string[] | null
          elements: string[]
          export_config?: Json | null
          id?: string
          is_active?: boolean | null
          levels: string[]
          operational_config?: Json | null
          organization: string
          section_mode?: string
          sport_code: string
          sport_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          divisions?: string[] | null
          elements?: string[]
          export_config?: Json | null
          id?: string
          is_active?: boolean | null
          levels?: string[]
          operational_config?: Json | null
          organization?: string
          section_mode?: string
          sport_code?: string
          sport_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sport_titles: {
        Row: {
          abbreviation: string
          created_at: string | null
          full_name: string
          id: string
          prerequisite_title_id: string | null
          required_elements: string[] | null
          required_legs: number
          sort_order: number | null
          sport_template_id: string
          supersedes_title_ids: string[] | null
          title_type: string
          updated_at: string | null
        }
        Insert: {
          abbreviation: string
          created_at?: string | null
          full_name: string
          id?: string
          prerequisite_title_id?: string | null
          required_elements?: string[] | null
          required_legs: number
          sort_order?: number | null
          sport_template_id: string
          supersedes_title_ids?: string[] | null
          title_type: string
          updated_at?: string | null
        }
        Update: {
          abbreviation?: string
          created_at?: string | null
          full_name?: string
          id?: string
          prerequisite_title_id?: string | null
          required_elements?: string[] | null
          required_legs?: number
          sort_order?: number | null
          sport_template_id?: string
          supersedes_title_ids?: string[] | null
          title_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sport_titles_prerequisite_title_id_fkey"
            columns: ["prerequisite_title_id"]
            isOneToOne: false
            referencedRelation: "sport_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_titles_sport_template_id_fkey"
            columns: ["sport_template_id"]
            isOneToOne: false
            referencedRelation: "sport_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          livemode: boolean
          person_id: string
          stripe_customer_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          livemode?: boolean
          person_id: string
          stripe_customer_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          livemode?: boolean
          person_id?: string
          stripe_customer_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_customers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_order_refunds: {
        Row: {
          amount_cents: number
          created_at: string
          kind: string
          order_id: string | null
          state: string
          stripe_payment_intent_id: string
          stripe_refund_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          kind: string
          order_id?: string | null
          state?: string
          stripe_payment_intent_id: string
          stripe_refund_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          kind?: string
          order_id?: string | null
          state?: string
          stripe_payment_intent_id?: string
          stripe_refund_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_order_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "stripe_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_orders: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string | null
          customer_id: string | null
          enrollment_id: string | null
          entry_ids: string[] | null
          entry_subtotal_cents: number | null
          id: string
          make_whole_refunded_cents: number
          metadata: Json | null
          order_type: string | null
          paid_at: string | null
          platform_fee_cents: number | null
          platform_fee_rate: number | null
          refunded_at: string | null
          refunded_cents: number
          show_id: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_processing_fee_cents: number | null
          updated_at: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          enrollment_id?: string | null
          entry_ids?: string[] | null
          entry_subtotal_cents?: number | null
          id?: string
          make_whole_refunded_cents?: number
          metadata?: Json | null
          order_type?: string | null
          paid_at?: string | null
          platform_fee_cents?: number | null
          platform_fee_rate?: number | null
          refunded_at?: string | null
          refunded_cents?: number
          show_id?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_processing_fee_cents?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          enrollment_id?: string | null
          entry_ids?: string[] | null
          entry_subtotal_cents?: number | null
          id?: string
          make_whole_refunded_cents?: number
          metadata?: Json | null
          order_type?: string | null
          paid_at?: string | null
          platform_fee_cents?: number | null
          platform_fee_rate?: number | null
          refunded_at?: string | null
          refunded_cents?: number
          show_id?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_processing_fee_cents?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "stripe_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_orders_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "stripe_orders_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      stripe_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string | null
          id: string
          status: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string | null
          id?: string
          status?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id: string
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string | null
          id?: string
          status?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "stripe_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_entitlement_grants: {
        Row: {
          created_at: string
          ends_at: string
          grant_type: string
          granted_by_person_id: string | null
          id: string
          person_id: string
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_person_id: string | null
          starts_at: string
          superseded_at: string | null
          superseded_by_grant_id: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          grant_type: string
          granted_by_person_id?: string | null
          id?: string
          person_id: string
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_person_id?: string | null
          starts_at: string
          superseded_at?: string | null
          superseded_by_grant_id?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          grant_type?: string
          granted_by_person_id?: string | null
          id?: string
          person_id?: string
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_person_id?: string | null
          starts_at?: string
          superseded_at?: string | null
          superseded_by_grant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_entitlement_grants_granted_by_person_id_fkey"
            columns: ["granted_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_entitlement_grants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_entitlement_grants_revoked_by_person_id_fkey"
            columns: ["revoked_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_entitlement_grants_superseded_by_grant_id_fkey"
            columns: ["superseded_by_grant_id"]
            isOneToOne: false
            referencedRelation: "subscription_entitlement_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_from_operator: boolean
          read_at: string | null
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_from_operator?: boolean
          read_at?: string | null
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_from_operator?: boolean
          read_at?: string | null
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          diagnostics: Json
          id: string
          is_show_day_priority: boolean
          owner_id: string
          show_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          diagnostics?: Json
          id?: string
          is_show_day_priority?: boolean
          owner_id: string
          show_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          diagnostics?: Json
          id?: string
          is_show_day_priority?: boolean
          owner_id?: string
          show_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "support_tickets_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          client_data: Json | null
          created_at: string | null
          id: string
          record_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          server_data: Json | null
          table_name: string
        }
        Insert: {
          client_data?: Json | null
          created_at?: string | null
          id?: string
          record_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          server_data?: Json | null
          table_name: string
        }
        Update: {
          client_data?: Json | null
          created_at?: string | null
          id?: string
          record_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          server_data?: Json | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_snapshots: {
        Row: {
          checks: Json
          created_at: string
          id: string
          overall_status: string
          run_duration_ms: number | null
          source: string
        }
        Insert: {
          checks: Json
          created_at?: string
          id?: string
          overall_status: string
          run_duration_ms?: number | null
          source: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          overall_status?: string
          run_duration_ms?: number | null
          source?: string
        }
        Relationships: []
      }
      training_goals: {
        Row: {
          completed_at: string | null
          created_at: string
          dog_id: string
          id: string
          notes: string | null
          owner_id: string
          sport_tag: string | null
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dog_id: string
          id?: string
          notes?: string | null
          owner_id: string
          sport_tag?: string | null
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dog_id?: string
          id?: string
          notes?: string | null
          owner_id?: string
          sport_tag?: string | null
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_goals_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_journal_entries: {
        Row: {
          assessment: string | null
          content: string | null
          created_at: string
          date: string
          dog_id: string
          duration_minutes: number | null
          goals: string[] | null
          id: string
          linked_result_id: string | null
          location: string | null
          notes: string | null
          owner_id: string
          sport_tag: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assessment?: string | null
          content?: string | null
          created_at?: string
          date?: string
          dog_id: string
          duration_minutes?: number | null
          goals?: string[] | null
          id?: string
          linked_result_id?: string | null
          location?: string | null
          notes?: string | null
          owner_id: string
          sport_tag?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assessment?: string | null
          content?: string | null
          created_at?: string
          date?: string
          dog_id?: string
          duration_minutes?: number | null
          goals?: string[] | null
          id?: string
          linked_result_id?: string | null
          location?: string | null
          notes?: string | null
          owner_id?: string
          sport_tag?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_journal_entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_milestones: {
        Row: {
          created_at: string
          date: string
          description: string | null
          dog_id: string
          id: string
          linked_title_id: string | null
          owner_id: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          description?: string | null
          dog_id: string
          id?: string
          linked_title_id?: string | null
          owner_id: string
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          dog_id?: string
          id?: string
          linked_title_id?: string | null
          owner_id?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_milestones_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_checklist_state: {
        Row: {
          auto_completed: boolean
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          item_key: string
          item_type: string
          label: string | null
          sort_order: number
          stage: number
          trial_id: string
          updated_at: string
        }
        Insert: {
          auto_completed?: boolean
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_key: string
          item_type: string
          label?: string | null
          sort_order?: number
          stage: number
          trial_id: string
          updated_at?: string
        }
        Update: {
          auto_completed?: boolean
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          item_key?: string
          item_type?: string
          label?: string | null
          sort_order?: number
          stage?: number
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_checklist_state_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      trial_judge_supplies: {
        Row: {
          created_at: string
          id: string
          included: boolean
          is_custom: boolean
          item_label: string
          judge_name: string
          note: string | null
          person_id: string | null
          sort_order: number
          trial_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          included?: boolean
          is_custom?: boolean
          item_label: string
          judge_name: string
          note?: string | null
          person_id?: string | null
          sort_order?: number
          trial_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          included?: boolean
          is_custom?: boolean
          item_label?: string
          judge_name?: string
          note?: string | null
          person_id?: string | null
          sort_order?: number
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_judge_supplies_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_judge_supplies_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      trial_visibility_overrides: {
        Row: {
          faults_timing: string | null
          placement_timing: string | null
          preset: string | null
          qualification_timing: string | null
          self_checkin_enabled: boolean | null
          time_timing: string | null
          trial_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          faults_timing?: string | null
          placement_timing?: string | null
          preset?: string | null
          qualification_timing?: string | null
          self_checkin_enabled?: boolean | null
          time_timing?: string | null
          trial_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          faults_timing?: string | null
          placement_timing?: string | null
          preset?: string | null
          qualification_timing?: string | null
          self_checkin_enabled?: boolean | null
          time_timing?: string | null
          trial_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "trial_visibility_overrides_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: true
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      trials: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          allow_self_checkin: boolean | null
          category: string | null
          confirmation_date: string | null
          created_at: string | null
          date: string
          deleted_at: string | null
          deleted_by: string | null
          display_order: number | null
          event_number: string | null
          id: string
          image_url: string | null
          max_entries_per_dog: number | null
          max_entries_per_handler: number | null
          max_total_entries: number | null
          name: string
          pipeline_stage: number
          planned_start_time: string | null
          registry_id: string
          show_id: string
          status: string | null
          timezone: string
          trial_number: string | null
          trial_type: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          allow_self_checkin?: boolean | null
          category?: string | null
          confirmation_date?: string | null
          created_at?: string | null
          date: string
          deleted_at?: string | null
          deleted_by?: string | null
          display_order?: number | null
          event_number?: string | null
          id?: string
          image_url?: string | null
          max_entries_per_dog?: number | null
          max_entries_per_handler?: number | null
          max_total_entries?: number | null
          name: string
          pipeline_stage?: number
          planned_start_time?: string | null
          registry_id?: string
          show_id: string
          status?: string | null
          timezone?: string
          trial_number?: string | null
          trial_type?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          allow_self_checkin?: boolean | null
          category?: string | null
          confirmation_date?: string | null
          created_at?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          display_order?: number | null
          event_number?: string | null
          id?: string
          image_url?: string | null
          max_entries_per_dog?: number | null
          max_entries_per_handler?: number | null
          max_total_entries?: number | null
          name?: string
          pipeline_stage?: number
          planned_start_time?: string | null
          registry_id?: string
          show_id?: string
          status?: string | null
          timezone?: string
          trial_number?: string | null
          trial_type?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "trials_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      user_guide: {
        Row: {
          content: string
          created_at: string | null
          id: string
          keywords: string[] | null
          search_vector: unknown
          section: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          keywords?: string[] | null
          search_vector?: unknown
          section: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          keywords?: string[] | null
          search_vector?: unknown
          section?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_milestones: {
        Row: {
          achieved_at: string
          milestone_key: string
          tip_dismissed: boolean
          user_id: string
        }
        Insert: {
          achieved_at?: string
          milestone_key: string
          tip_dismissed?: boolean
          user_id: string
        }
        Update: {
          achieved_at?: string
          milestone_key?: string
          tip_dismissed?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          app: string
          auth_user_id: string | null
          created_at: string | null
          id: string
          license_key: string | null
          preferences: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          app: string
          auth_user_id?: string | null
          created_at?: string | null
          id?: string
          license_key?: string | null
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          app?: string
          auth_user_id?: string | null
          created_at?: string | null
          id?: string
          license_key?: string | null
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          auth_user_id: string | null
          club_id: string | null
          deactivated_at: string | null
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean
          role_id: string
          show_id: string | null
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          club_id?: string | null
          deactivated_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean
          role_id: string
          show_id?: string | null
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          club_id?: string | null
          deactivated_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean
          role_id?: string
          show_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "user_roles_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccinations: {
        Row: {
          administered_by: string | null
          created_at: string | null
          date_administered: string
          dog_id: string
          expiration_date: string | null
          id: string
          lot_number: string | null
          notes: string | null
          updated_at: string | null
          vaccine_name: string
        }
        Insert: {
          administered_by?: string | null
          created_at?: string | null
          date_administered: string
          dog_id: string
          expiration_date?: string | null
          id?: string
          lot_number?: string | null
          notes?: string | null
          updated_at?: string | null
          vaccine_name: string
        }
        Update: {
          administered_by?: string | null
          created_at?: string | null
          date_administered?: string
          dog_id?: string
          expiration_date?: string | null
          id?: string
          lot_number?: string | null
          notes?: string | null
          updated_at?: string | null
          vaccine_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vaccinations_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      vet_visits: {
        Row: {
          clinic_name: string | null
          cost: number | null
          created_at: string | null
          diagnosis: string | null
          dog_id: string
          follow_up_date: string | null
          id: string
          notes: string | null
          reason: string
          treatment: string | null
          updated_at: string | null
          vet_name: string | null
          visit_date: string
        }
        Insert: {
          clinic_name?: string | null
          cost?: number | null
          created_at?: string | null
          diagnosis?: string | null
          dog_id: string
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          reason: string
          treatment?: string | null
          updated_at?: string | null
          vet_name?: string | null
          visit_date: string
        }
        Update: {
          clinic_name?: string | null
          cost?: number | null
          created_at?: string | null
          diagnosis?: string | null
          dog_id?: string
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          reason?: string
          treatment?: string | null
          updated_at?: string | null
          vet_name?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vet_visits_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_class_assignments: {
        Row: {
          class_id: string
          created_at: string | null
          id: string
          notes: string | null
          role_id: string | null
          role_name: string | null
          status: string | null
          volunteer_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          role_id?: string | null
          role_name?: string | null
          status?: string | null
          volunteer_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          role_id?: string | null
          role_name?: string | null
          status?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "volunteer_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "volunteer_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "volunteer_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "volunteer_class_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "volunteer_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_class_assignments_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_general_assignments: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          role_id: string | null
          role_name: string | null
          shift_end: string | null
          shift_start: string | null
          show_id: string | null
          status: string | null
          trial_id: string | null
          volunteer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          role_id?: string | null
          role_name?: string | null
          shift_end?: string | null
          shift_start?: string | null
          show_id?: string | null
          status?: string | null
          trial_id?: string | null
          volunteer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          role_id?: string | null
          role_name?: string | null
          shift_end?: string | null
          shift_start?: string | null
          show_id?: string | null
          status?: string | null
          trial_id?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_general_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "volunteer_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "volunteer_general_assignments_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          license_key: string | null
          max_volunteers: number | null
          name: string
          requires_training: boolean | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          license_key?: string | null
          max_volunteers?: number | null
          name: string
          requires_training?: boolean | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          license_key?: string | null
          max_volunteers?: number | null
          name?: string
          requires_training?: boolean | null
        }
        Relationships: []
      }
      volunteers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_available: boolean | null
          license_key: string | null
          name: string
          notes: string | null
          person_id: string | null
          phone: string | null
          show_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_available?: boolean | null
          license_key?: string | null
          name: string
          notes?: string | null
          person_id?: string | null
          phone?: string | null
          show_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_available?: boolean | null
          license_key?: string | null
          name?: string
          notes?: string | null
          person_id?: string | null
          phone?: string | null
          show_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "volunteers_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          class_id: string
          created_at: string | null
          dog_id: string
          exhibitor_id: string
          handler_id: string | null
          id: string
          joined_via: string
          offer_expires_at: string | null
          offered_at: string | null
          position: number
          promoted_entry_id: string | null
          status: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          class_id: string
          created_at?: string | null
          dog_id: string
          exhibitor_id: string
          handler_id?: string | null
          id?: string
          joined_via?: string
          offer_expires_at?: string | null
          offered_at?: string | null
          position: number
          promoted_entry_id?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          class_id?: string
          created_at?: string | null
          dog_id?: string
          exhibitor_id?: string
          handler_id?: string | null
          id?: string
          joined_via?: string
          offer_expires_at?: string | null
          offered_at?: string | null
          position?: number
          promoted_entry_id?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "waitlist_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "waitlist_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "waitlist_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "waitlist_entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_exhibitor_id_fkey"
            columns: ["exhibitor_id"]
            isOneToOne: false
            referencedRelation: "exhibitor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_authenticated_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_entry_with_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_own_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_public_entry_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_promoted_entry_id_fkey"
            columns: ["promoted_entry_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["entry_id"]
          },
        ]
      }
      waitlist_notification_events: {
        Row: {
          attempt_count: number
          claim_token: string | null
          created_at: string
          email_sent_at: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          offer_cycle_at: string
          processing_started_at: string | null
          push_delivered_endpoint_hashes: string[]
          push_sent_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
          waitlist_entry_id: string
        }
        Insert: {
          attempt_count?: number
          claim_token?: string | null
          created_at?: string
          email_sent_at?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          offer_cycle_at: string
          processing_started_at?: string | null
          push_delivered_endpoint_hashes?: string[]
          push_sent_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          waitlist_entry_id: string
        }
        Update: {
          attempt_count?: number
          claim_token?: string | null
          created_at?: string
          email_sent_at?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          offer_cycle_at?: string
          processing_started_at?: string | null
          push_delivered_endpoint_hashes?: string[]
          push_sent_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          waitlist_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_notification_events_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      judge_day_summary: {
        Row: {
          class_ids: string[] | null
          class_names: string[] | null
          confirmed_count: number | null
          judge_id: string | null
          judge_name: string | null
          show_date: string | null
          show_id: string | null
          waitlist_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_person_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      view_authenticated_entry_results: {
        Row: {
          area1_correct: number | null
          area1_faults: number | null
          area1_incorrect: number | null
          area1_time_seconds: number | null
          area2_correct: number | null
          area2_faults: number | null
          area2_incorrect: number | null
          area2_time_seconds: number | null
          area3_correct: number | null
          area3_faults: number | null
          area3_incorrect: number | null
          area3_time_seconds: number | null
          area4_time_seconds: number | null
          armband: string | null
          bonus_points: number | null
          check_in_status: string | null
          class_element: string | null
          class_id: string | null
          class_level: string | null
          class_name: string | null
          class_results_released_at: string | null
          comped: boolean | null
          comped_reason: string | null
          confirmation_email_message_id: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_status: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number | null
          disqualification_reason: string | null
          dog_breed: string | null
          dog_call_name: string | null
          dog_id: string | null
          dog_image_url: string | null
          dog_name: string | null
          entry_fee: number | null
          entry_source: string | null
          entry_status: string | null
          final_placement: number | null
          handler: string | null
          handler_id: string | null
          has_video_review: boolean | null
          id: string | null
          is_day_of_show: boolean | null
          is_in_ring: boolean | null
          is_own_entry: boolean | null
          is_scored: boolean | null
          judge_notes: string | null
          judge_signature: string | null
          judge_signature_timestamp: string | null
          jump_height: string | null
          last_synced_at: string | null
          license_key: string | null
          local_id: string | null
          move_up_requested: boolean | null
          no_finish_count: number | null
          payment_method: string | null
          payment_status: string | null
          penalty_points: number | null
          points_earned: number | null
          points_possible: number | null
          preferred_judge: string | null
          promo_code_id: string | null
          refund_amount: number | null
          refund_notes: string | null
          refunded_at: string | null
          registration_id: string | null
          result_status: string | null
          result_text: string | null
          ring_entry_time: string | null
          ring_exit_time: string | null
          run_order: number | null
          scoring_completed_at: string | null
          scoring_started_at: string | null
          search_time_seconds: number | null
          show_id: string | null
          show_name: string | null
          show_organization: string | null
          show_start_date: string | null
          special_requests: string | null
          stripe_payment_intent_id: string | null
          submitted_at: string | null
          sync_version: number | null
          time_limit_exceeded_seconds: number | null
          time_over_limit: boolean | null
          total_correct_finds: number | null
          total_faults: number | null
          total_incorrect_finds: number | null
          total_score: number | null
          trial_id: string | null
          updated_at: string | null
          version: number | null
          video_review_notes: string | null
          withdrawal_reason: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      view_breed_stats: {
        Row: {
          absent_count: number | null
          avg_time: number | null
          class_id: string | null
          dog_breed: string | null
          excused_count: number | null
          fastest_time: number | null
          license_key: string | null
          nq_count: number | null
          qualification_rate: number | null
          qualified_count: number | null
          qualified_times_array: number[] | null
          show_id: string | null
          total_entries: number | null
          trial_id: string | null
          withdrawn_count: number | null
        }
        Relationships: []
      }
      view_clean_sweep_dogs: {
        Row: {
          armband_number: number | null
          dog_breed: string | null
          dog_call_name: string | null
          elements_entered: number | null
          elements_list: string[] | null
          elements_qualified: number | null
          handler_name: string | null
          is_clean_sweep: boolean | null
          license_key: string | null
          show_id: string | null
          trial_id: string | null
        }
        Relationships: []
      }
      view_entry_with_results: {
        Row: {
          area1_correct: number | null
          area1_faults: number | null
          area1_incorrect: number | null
          area1_time_seconds: number | null
          area2_correct: number | null
          area2_faults: number | null
          area2_incorrect: number | null
          area2_time_seconds: number | null
          area3_correct: number | null
          area3_faults: number | null
          area3_incorrect: number | null
          area3_time_seconds: number | null
          area4_time_seconds: number | null
          armband: string | null
          bonus_points: number | null
          check_in_status: string | null
          class_element: string | null
          class_id: string | null
          class_level: string | null
          class_name: string | null
          class_results_released_at: string | null
          comped: boolean | null
          comped_reason: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number | null
          disqualification_reason: string | null
          dog_breed: string | null
          dog_call_name: string | null
          dog_id: string | null
          dog_name: string | null
          entry_fee: number | null
          entry_status: string | null
          final_placement: number | null
          handler: string | null
          handler_id: string | null
          has_video_review: boolean | null
          id: string | null
          is_in_ring: boolean | null
          is_scored: boolean | null
          judge_notes: string | null
          judge_signature: string | null
          judge_signature_timestamp: string | null
          jump_height: string | null
          last_synced_at: string | null
          license_key: string | null
          local_id: string | null
          move_up_requested: boolean | null
          no_finish_count: number | null
          payment_status: string | null
          penalty_points: number | null
          points_earned: number | null
          points_possible: number | null
          preferred_judge: string | null
          promo_code_id: string | null
          registration_id: string | null
          result_status: string | null
          result_text: string | null
          ring_entry_time: string | null
          ring_exit_time: string | null
          run_order: number | null
          scoring_completed_at: string | null
          scoring_started_at: string | null
          search_time_seconds: number | null
          show_id: string | null
          special_requests: string | null
          submitted_at: string | null
          sync_version: number | null
          time_limit_exceeded_seconds: number | null
          time_over_limit: boolean | null
          total_correct_finds: number | null
          total_faults: number | null
          total_incorrect_finds: number | null
          total_score: number | null
          trial_id: string | null
          updated_at: string | null
          video_review_notes: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      view_fastest_times: {
        Row: {
          armband_number: number | null
          class_id: string | null
          dog_breed: string | null
          dog_call_name: string | null
          element: string | null
          entry_id: string | null
          handler_name: string | null
          level: string | null
          license_key: string | null
          search_time_seconds: number | null
          show_id: string | null
          time_rank: number | null
          trial_id: string | null
        }
        Relationships: []
      }
      view_judge_stats: {
        Row: {
          avg_qualified_time: number | null
          classes_judged: number | null
          judge_name: string | null
          license_key: string | null
          qualification_rate: number | null
          qualified_count: number | null
          show_id: string | null
          total_entries: number | null
          trial_id: string | null
        }
        Relationships: []
      }
      view_myk9q_entries: {
        Row: {
          area_count: number | null
          armband: number | null
          class_id: string | null
          class_status: string | null
          created_at: string | null
          dog_breed: string | null
          dog_call_name: string | null
          element: string | null
          entry_status: string | null
          final_placement: number | null
          handler: string | null
          id: string | null
          is_in_ring: boolean | null
          is_scored: boolean | null
          is_scoring_finalized: boolean | null
          judge_name: string | null
          level: string | null
          license_key: string | null
          no_finish_count: number | null
          points_earned: number | null
          result_status: string | null
          results_released_at: string | null
          run_order: number | null
          scoring_completed_at: string | null
          search_time_seconds: number | null
          section: string | null
          show_id: string | null
          show_name: string | null
          time_limit_area2_seconds: number | null
          time_limit_area3_seconds: number | null
          time_limit_seconds: number | null
          total_correct_finds: number | null
          total_faults: number | null
          total_incorrect_finds: number | null
          trial_date: string | null
          trial_id: string | null
          trial_number: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      view_own_entry_results: {
        Row: {
          armband: string | null
          check_in_status: string | null
          class_id: string | null
          class_results_released_at: string | null
          created_at: string | null
          dog_id: string | null
          dog_image_url: string | null
          entry_fee: number | null
          entry_status: string | null
          final_placement: number | null
          handler: string | null
          handler_id: string | null
          id: string | null
          is_in_ring: boolean | null
          is_scored: boolean | null
          jump_height: string | null
          payment_status: string | null
          registration_id: string | null
          result_status: string | null
          result_text: string | null
          run_order: number | null
          scoring_completed_at: string | null
          search_time_seconds: number | null
          show_id: string | null
          special_requests: string | null
          submitted_at: string | null
          total_faults: number | null
          total_score: number | null
          trial_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
        ]
      }
      view_public_entry_results: {
        Row: {
          armband: string | null
          check_in_status: string | null
          class_element: string | null
          class_id: string | null
          class_level: string | null
          class_name: string | null
          class_results_released_at: string | null
          created_at: string | null
          dog_breed: string | null
          dog_call_name: string | null
          dog_id: string | null
          dog_image_url: string | null
          dog_name: string | null
          entry_status: string | null
          final_placement: number | null
          handler: string | null
          id: string | null
          is_in_ring: boolean | null
          is_scored: boolean | null
          result_status: string | null
          result_text: string | null
          run_order: number | null
          scoring_completed_at: string | null
          search_time_seconds: number | null
          show_id: string | null
          total_faults: number | null
          total_score: number | null
          trial_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["trial_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "entries_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_breed_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_clean_sweep_dogs"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_fastest_times"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_judge_stats"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_myk9q_entries"
            referencedColumns: ["show_id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "view_stats_summary"
            referencedColumns: ["show_id"]
          },
        ]
      }
      view_stats_summary: {
        Row: {
          armband_number: number | null
          class_id: string | null
          dog_breed: string | null
          dog_call_name: string | null
          element: string | null
          entry_id: string | null
          final_placement: number | null
          handler_name: string | null
          is_qualified: number | null
          is_scored: boolean | null
          judge_name: string | null
          level: string | null
          license_key: string | null
          qualifying_score: number | null
          result_status: string | null
          score: number | null
          search_time_seconds: number | null
          show_id: string | null
          show_name: string | null
          total_faults: number | null
          trial_date: string | null
          trial_id: string | null
          trial_name: string | null
          valid_time: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _account_ringside_show_id: { Args: { p_route: string }; Returns: string }
      _can_manage_show_passcodes: {
        Args: { p_show_id: string }
        Returns: boolean
      }
      _decrypt_show_passcode: {
        Args: { p_ciphertext: string }
        Returns: string
      }
      _encrypt_show_passcode: { Args: { p_code: string }; Returns: string }
      _extract_at_show_route_show_id: {
        Args: { p_route: string }
        Returns: string
      }
      _financial_reconciliation_authorize: {
        Args: { p_club_id: string; p_scope: string; p_show_id: string }
        Returns: undefined
      }
      _generate_unique_role_code: {
        Args: { p_role: string }
        Returns: {
          hash: string
          plaintext: string
        }[]
      }
      _hash_passcode: { Args: { p_code: string }; Returns: string }
      _random_role_code: { Args: { p_role: string }; Returns: string }
      _result_timing_visible: {
        Args: { p_state: string; p_timing: string }
        Returns: boolean
      }
      _result_visibility_preset: {
        Args: { p_field: string; p_preset: string }
        Returns: string
      }
      _show_passcode_encryption_key: { Args: never; Returns: string }
      add_to_waitlist: {
        Args: {
          p_class_id: string
          p_dog_id: string
          p_exhibitor_id: string
          p_handler_id?: string
          p_joined_via?: string
        }
        Returns: {
          class_id: string
          created_at: string | null
          dog_id: string
          exhibitor_id: string
          handler_id: string | null
          id: string
          joined_via: string
          offer_expires_at: string | null
          offered_at: string | null
          position: number
          promoted_entry_id: string | null
          status: string | null
          updated_at: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "waitlist_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_grant_entitlement: {
        Args: {
          p_ends_at: string
          p_grant_type: string
          p_person_id: string
          p_reason: string
          p_replace_active?: boolean
          p_starts_at: string
        }
        Returns: string
      }
      admin_revoke_entitlement: {
        Args: { p_grant_id: string; p_reason: string }
        Returns: undefined
      }
      approve_role_request: {
        Args: {
          p_club_id: string
          p_request_id: string
          p_reviewer_note?: string
          p_show_id?: string
        }
        Returns: undefined
      }
      assign_armband: {
        Args: { p_dog_id: string; p_show_id: string }
        Returns: number
      }
      audit_cron_vault_secrets: {
        Args: never
        Returns: {
          jobname: string
          missing_secret: string
        }[]
      }
      can_manage_show: { Args: { check_show_id: string }; Returns: boolean }
      can_manage_show_dog: { Args: { check_dog_id: string }; Returns: boolean }
      can_manage_show_lifecycle_email: {
        Args: { p_show_id: string }
        Returns: boolean
      }
      can_manage_show_person: {
        Args: { check_person_id: string }
        Returns: boolean
      }
      can_manage_show_person_for_show: {
        Args: { p_person_id: string; p_show_id: string }
        Returns: boolean
      }
      can_manage_trial: { Args: { check_trial_id: string }; Returns: boolean }
      check_and_record_premium_generation_attempt: {
        Args: { p_auth_user_id: string; p_show_id: string }
        Returns: {
          allowed: boolean
          attempts_count: number
          remaining_attempts: number
          retry_after_seconds: number
        }[]
      }
      check_class_availability: {
        Args: { p_class_id: string }
        Returns: {
          available_spots: number
          confirmed_count: number
          entry_limit: number
          is_available: boolean
          waitlist_position: number
        }[]
      }
      check_login_rate_limit: {
        Args: { p_ip_address: string }
        Returns: {
          allowed: boolean
          attempts_count: number
          blocked_until: string
          message: string
          remaining_attempts: number
        }[]
      }
      claim_waitlist_notification_event: {
        Args: { p_event_id: string }
        Returns: {
          claim_token: string
          email_sent_at: string
          event_id: string
          event_type: string
          offer_cycle_at: string
          push_delivered_endpoint_hashes: string[]
          push_sent_at: string
          waitlist_entry_id: string
        }[]
      }
      cleanup_stale_ringside_anon_users: {
        Args: {
          p_claimless_ttl?: string
          p_ended_grace?: string
          p_max_age?: string
        }
        Returns: number
      }
      clear_ringside_session_presence: {
        Args: { p_show_id: string; p_subscription_endpoint: string }
        Returns: undefined
      }
      create_dog_with_registrations: {
        Args: { p_dog: Json; p_registrations: Json }
        Returns: string
      }
      create_online_paid_entry: {
        Args: {
          p_class_id: string
          p_dog_id: string
          p_entry_fee: number
          p_exhibitor_id: string
          p_handler_id: string
          p_jump_height: string
          p_payment_intent_id: string
          p_show_id: string
          p_special_requests: string
          p_submitted_at: string
          p_trial_id: string
        }
        Returns: {
          entry_id: string
          outcome: string
          waitlist_entry_id: string
        }[]
      }
      create_or_reuse_club: {
        Args: { p_club: Json }
        Returns: {
          accent_color: string | null
          address: string | null
          city: string | null
          club_number: string | null
          cover_image_url: string | null
          created_at: string | null
          default_withdrawal_cutoff_date: string | null
          default_withdrawal_policy_notes: string | null
          default_withdrawal_retention_type: string | null
          default_withdrawal_retention_value: number | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          email: string | null
          id: string
          license_key: string | null
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string | null
          version: number
          website: string | null
          zip_code: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_show_managed_dog: {
        Args: {
          p_breed: string
          p_call_name?: string
          p_microchip_number?: string
          p_name: string
          p_owner_id: string
          p_sex?: string
          p_show_id: string
        }
        Returns: string
      }
      create_show_managed_person: {
        Args: {
          p_email?: string
          p_first_name: string
          p_last_name: string
          p_phone?: string
          p_show_id: string
        }
        Returns: string
      }
      create_show_with_children: {
        Args: {
          p_classes: Json
          p_judge_ids: string[]
          p_show: Json
          p_trials: Json
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_show_managed_person: {
        Args: { p_person_id: string; p_show_id: string }
        Returns: undefined
      }
      deny_role_request: {
        Args: { p_request_id: string; p_reviewer_note?: string }
        Returns: undefined
      }
      enqueue_due_waitlist_reminder_events: {
        Args: { p_limit?: number; p_now?: string }
        Returns: {
          event_id: string
          event_type: string
          waitlist_entry_id: string
        }[]
      }
      enqueue_waitlist_notification_event: {
        Args: { p_event_type: string; p_waitlist_entry_id: string }
        Returns: string
      }
      ensure_show_lifecycle_email_steps: {
        Args: { p_show_id: string }
        Returns: undefined
      }
      evaluate_entry_capacity: {
        Args: {
          p_allow_override?: boolean
          p_class_id: string
          p_dog_id: string
          p_exhibitor_id: string
          p_handler_id: string
          p_submission_source: string
        }
        Returns: {
          capacity_override: boolean
          denial_reason: string
          outcome: string
          resolved_show_id: string
          resolved_trial_id: string
          waitlist_entry_id: string
          waitlist_position: number
        }[]
      }
      financial_reconciliation_orders: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_club_id?: string
          p_limit?: number
          p_scope: string
          p_show_id?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          entry_subtotal_cents: number
          make_whole_refunded_cents: number
          order_id: string
          order_type: string
          paid_at: string
          platform_fee_cents: number
          platform_fee_rate: number
          refunded_at: string
          refunded_cents: number
          show_id: string
          show_name: string
          status: string
          stripe_payment_intent_id: string
          stripe_processing_fee_cents: number
        }[]
      }
      financial_reconciliation_payouts: {
        Args: {
          p_after_created_at?: string
          p_after_id?: string
          p_club_id?: string
          p_limit?: number
          p_scope: string
          p_show_id?: string
        }
        Returns: {
          amount_cents: number
          completed_at: string
          created_at: string
          failure_reason: string
          payout_id: string
          scheduled_date: string
          show_id: string
          status: string
          stripe_transfer_id: string
        }[]
      }
      financial_reconciliation_summary: {
        Args: { p_club_id?: string; p_scope: string; p_show_id?: string }
        Returns: {
          entry_subtotal_cents: number
          gross_charged_cents: number
          make_whole_refunded_cents: number
          non_entry_gross_cents: number
          non_entry_make_whole_refunded_cents: number
          non_entry_order_count: number
          non_entry_refunded_cents: number
          order_count: number
          payout_completed_cents: number
          payout_count: number
          payout_failed_cents: number
          payout_failed_count: number
          payout_pending_cents: number
          pending_fee_platform_fee_cents: number
          pending_fee_refunded_cents: number
          platform_fee_cents: number
          processing_fee_cents: number
          processing_fee_pending_count: number
          refunded_cents: number
          snapshot_missing_count: number
        }[]
      }
      find_live_club_by_normalized_name: {
        Args: { p_exclude_id?: string; p_name: string }
        Returns: {
          accent_color: string | null
          address: string | null
          city: string | null
          club_number: string | null
          cover_image_url: string | null
          created_at: string | null
          default_withdrawal_cutoff_date: string | null
          default_withdrawal_policy_notes: string | null
          default_withdrawal_retention_type: string | null
          default_withdrawal_retention_value: number | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          email: string | null
          id: string
          license_key: string | null
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string | null
          version: number
          website: string | null
          zip_code: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_account_today_entries: {
        Args: never
        Returns: {
          class_id: string
          class_name: string
          class_start_time: string
          entry_id: string
          show_id: string
          show_name: string
          trial_id: string
        }[]
      }
      get_admin_user_list: {
        Args: { show_deleted?: boolean }
        Returns: {
          created_at: string
          deleted_at: string
          deleted_by: string
          email: string
          first_name: string
          id: string
          last_name: string
          last_sign_in_at: string
          phone: string
          profile_image: string
          roles: string[]
          status: string
          updated_at: string
        }[]
      }
      get_club_show_manager_ids: {
        Args: { p_club_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_deleted_classes: {
        Args: never
        Returns: {
          actual_end_time: string | null
          actual_start_time: string | null
          age_max: number | null
          age_min: number | null
          allow_waitlist: boolean | null
          breed_restrictions: string[] | null
          checked_in_count: number | null
          class_number: string | null
          competition_type: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          display_order: number | null
          distraction_count: number | null
          dogs_ahead_notification_count: number | null
          element: string | null
          entry_fee: number | null
          estimated_duration: number | null
          handler_age_max: number | null
          handler_age_min: number | null
          has_blank: boolean | null
          height_max: number | null
          height_min: number | null
          hides_known: boolean | null
          id: string
          is_results_reviewed: boolean | null
          is_scoring_finalized: boolean | null
          judge_name: string | null
          jump_heights: string[] | null
          level: string | null
          max_dogs_per_handler: number | null
          max_entries: number | null
          max_faults: number | null
          name: string
          num_areas: number | null
          num_hides: number | null
          qualifying_threshold: number | null
          reopened_after_closeout_at: string | null
          results_released_at: string | null
          results_released_by: string | null
          revised_expected_start: string | null
          scored_count: number | null
          section: string | null
          start_time: string | null
          status: string | null
          status_source: string
          time_limit_area2_seconds: number | null
          time_limit_area3_seconds: number | null
          time_limit_seconds: number | null
          timer_mode: string | null
          total_entries_count: number | null
          trial_id: string
          updated_at: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "classes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_deleted_dogs: {
        Args: never
        Returns: {
          breed: string
          breeder_id: string | null
          call_name: string
          co_owner_id: string | null
          color: string | null
          created_at: string | null
          date_of_birth: string | null
          deceased: boolean | null
          deceased_date: string | null
          deleted_at: string | null
          deleted_by: string | null
          height: string | null
          id: string
          image_url: string | null
          license_key: string | null
          microchip_number: string | null
          name: string | null
          owner_id: string | null
          sex: string | null
          spayed_neutered: boolean | null
          status: string | null
          updated_at: string | null
          version: number
          weight: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dogs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_deleted_people: {
        Args: never
        Returns: {
          agreed_to_tos_at: string | null
          auth_user_id: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          license_key: string | null
          phone: string | null
          profile_image: string | null
          state: string | null
          status: string
          street_address: string | null
          updated_at: string | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_deleted_shows: {
        Args: never
        Returns: {
          accent_color: string | null
          accept_cash_payments: boolean
          accept_check_payments: boolean
          address: string | null
          allow_non_owner_handlers: boolean | null
          brand_color: string
          cc_secretary_on_exhibitor_emails: boolean
          city: string | null
          club_id: string | null
          confirmation_message: string | null
          cover_image_url: string | null
          created_at: string | null
          day_of_show_fee: number | null
          default_judge_day_capacity: number
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          end_date: string
          entry_close_date: string | null
          entry_open_date: string | null
          experience_is_published: boolean
          experience_published_at: string | null
          experience_published_content: Json
          experience_published_style: string | null
          id: string
          is_nationals: boolean
          latitude: number | null
          license_key: string | null
          location: string | null
          logo_url: string | null
          longitude: number | null
          mail_in_auto_release: boolean
          mail_in_deadline: string | null
          mail_in_release_date: string | null
          mail_in_strategy: string | null
          mail_in_value: number | null
          max_entries_per_dog: number | null
          max_total_entries: number | null
          name: string
          organization: string
          pre_entry_fee: number | null
          published_premium_at: string | null
          published_premium_url: string | null
          results_released_at: string | null
          results_visible_to_all: boolean | null
          secretary_email: string | null
          start_date: string
          starting_armband_number: number
          state: string | null
          status: string | null
          style: string
          updated_at: string | null
          venue_name: string | null
          venue_wifi_network: string | null
          venue_wifi_password: string | null
          version: number
          waitlist_payment_deadline_hours: number
          withdrawal_cutoff_date: string | null
          withdrawal_policy_notes: string | null
          withdrawal_retention_type: string | null
          withdrawal_retention_value: number | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "shows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_effective_permissions: {
        Args: {
          filter_scope_id?: string
          filter_scope_type?: string
          user_id: string
        }
        Returns: {
          permission_code: string
          permission_name: string
          scope_id: string
          scope_type: string
          source_role: string
          source_type: string
        }[]
      }
      get_entries_for_export: {
        Args: { p_show_id: string }
        Returns: {
          armband: string
          class_name: string
          class_number: string
          dog_breed: string
          dog_call_name: string
          dog_id: string
          dog_name: string
          dog_registrations: Json
          entry_fee: number
          entry_status: string
          handler: string
          id: string
          jump_height: string
          owner_email: string
          owner_first_name: string
          owner_last_name: string
          owner_phone: string
          payment_status: string
          run_order: number
          special_requests: string
          submitted_at: string
        }[]
      }
      get_judge_day_capacity: {
        Args: { p_date: string; p_judge_id: string; p_show_id: string }
        Returns: {
          available_spots: number
          capacity: number
          class_ids: string[]
          confirmed_count: number
          judge_id: string
          mail_in_reserved: number
          show_date: string
          waitlist_count: number
        }[]
      }
      get_judge_day_capacity_live: {
        Args: { p_date: string; p_judge_id: string; p_show_id: string }
        Returns: {
          available_spots: number
          capacity: number
          class_ids: string[]
          confirmed_count: number
          judge_id: string
          mail_in_reserved: number
          show_date: string
          waitlist_count: number
        }[]
      }
      get_license_key: { Args: never; Returns: string }
      get_manager_judge_assignments: {
        Args: never
        Returns: {
          class_id: string | null
          confirmed_at: string | null
          created_at: string | null
          day_capacity_override: number | null
          fee: number | null
          id: string
          invited_at: string | null
          notes: string | null
          person_id: string
          show_id: string | null
          status: string | null
          trial_id: string | null
          updated_at: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "judge_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_message_class_entry_counts: {
        Args: { p_class_ids: string[] }
        Returns: {
          class_id: string
          entry_count: number
        }[]
      }
      get_my_handled_dog_ids: { Args: never; Returns: string[] }
      get_my_onboarding_requests: {
        Args: never
        Returns: {
          auth_user_id: string
          club_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          first_show_date: string
          id: string
          message: string
          organization: string
          status: string
        }[]
      }
      get_my_person_id: { Args: never; Returns: string }
      get_own_entitlement_context: {
        Args: never
        Returns: {
          evaluated_at: string
          grant_ends_at: string
          grant_starts_at: string
          grant_status: string
          grant_type: string
          paid_expires_at: string
          paid_tier: string
          scored_show_count: number
        }[]
      }
      get_show_access_codes: {
        Args: { p_show_id: string }
        Returns: {
          passcode: string
          recoverable: boolean
          role: string
        }[]
      }
      get_show_class_hide_counts: {
        Args: { p_show_id: string }
        Returns: {
          class_id: string
          num_hides: number
        }[]
      }
      get_show_officials: {
        Args: { p_show_id: string }
        Returns: {
          email: string
          first_name: string
          last_name: string
          role: string
          user_id: string
        }[]
      }
      get_user_permissions: {
        Args: {
          filter_scope_id?: string
          filter_scope_type?: string
          user_id: string
        }
        Returns: {
          category: string
          description: string
          permission_code: string
          permission_id: string
          permission_name: string
          role_id: string
          role_name: string
          scope_id: string
          scope_type: string
        }[]
      }
      get_user_roles: {
        Args: { user_id: string }
        Returns: {
          expires_at: string
          granted_at: string
          granted_by: string
          is_active: boolean
          is_system: boolean
          role_description: string
          role_id: string
          role_name: string
          scope_id: string
          scope_type: string
          user_role_id: string
        }[]
      }
      grant_club_secretary: {
        Args: { p_club_id: string; p_person_id: string }
        Returns: string
      }
      grant_show_official: {
        Args: { p_person_id: string; p_role_name: string; p_show_id: string }
        Returns: string
      }
      hard_delete_show: { Args: { p_show_id: string }; Returns: undefined }
      has_effective_premium_access: {
        Args: { p_evaluated_at?: string; p_person_id: string }
        Returns: boolean
      }
      has_role: {
        Args: { role_name: string; scope_club_id?: string }
        Returns: boolean
      }
      increment_promo_usage: { Args: { promo_id: string }; Returns: undefined }
      insert_club_access_request_from_signup: {
        Args: { p_auth_user_id: string; p_metadata: Json; p_person_id: string }
        Returns: undefined
      }
      insert_show_passcodes: {
        Args: { p_show_id: string }
        Returns: {
          admin: string
          exhibitor: string
          judge: string
          steward: string
        }[]
      }
      insert_signup_role_requests: {
        Args: {
          p_auth_user_id: string
          p_intended_roles: Json
          p_person_id: string
        }
        Returns: undefined
      }
      is_active_club_member: {
        Args: { p_club_id: string; p_person_id: string }
        Returns: boolean
      }
      is_club_admin: { Args: { check_club_id?: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_real_account: { Args: never; Returns: boolean }
      is_show_manager: { Args: never; Returns: boolean }
      is_show_office_manager: {
        Args: { check_show_id: string }
        Returns: boolean
      }
      is_show_official: { Args: { check_show_id: string }; Returns: boolean }
      is_show_secretary:
        | { Args: never; Returns: boolean }
        | { Args: { check_show_id: string }; Returns: boolean }
      is_site_admin: { Args: never; Returns: boolean }
      is_trial_secretary: { Args: { check_club_id?: string }; Returns: boolean }
      list_cron_vault_secret_refs: {
        Args: never
        Returns: {
          jobname: string
          secret_exists: boolean
          secret_name: string
        }[]
      }
      list_retryable_waitlist_notification_events: {
        Args: { p_limit?: number }
        Returns: {
          event_id: string
          event_type: string
          waitlist_entry_id: string
        }[]
      }
      manageable_show_ids: { Args: never; Returns: string[] }
      normalize_club_name: { Args: { value: string }; Returns: string }
      normalize_dog_registration_number: {
        Args: { value: string }
        Returns: string
      }
      normalize_dog_registration_organization: {
        Args: { value: string }
        Returns: string
      }
      promote_waitlist_entry: {
        Args: { p_deadline_hours?: number; p_waitlist_entry_id: string }
        Returns: string
      }
      promote_waitlist_entry_from_cron: {
        Args: { p_waitlist_entry_id: string }
        Returns: string
      }
      promote_waitlist_entry_internal: {
        Args: { p_deadline_hours?: number; p_waitlist_entry_id: string }
        Returns: string
      }
      prune_premium_generation_attempts: { Args: never; Returns: number }
      prune_stale_ringside_sessions: { Args: never; Returns: number }
      recalculate_class_placements: {
        Args: { p_class_ids: string[]; p_is_nationals?: boolean }
        Returns: undefined
      }
      recompute_order_refund_totals: {
        Args: { p_payment_intent_id: string }
        Returns: {
          fully_refunded: boolean
          make_whole_cents: number
          order_amount_cents: number
          order_id: string
          order_status: string
          order_type: string
          post_hoc_cents: number
        }[]
      }
      record_login_attempt: {
        Args: {
          p_ip_address: string
          p_license_key?: string
          p_passcode_prefix?: string
          p_success: boolean
          p_user_agent?: string
        }
        Returns: undefined
      }
      record_order_refund_cents: {
        Args: {
          p_amount_cents: number
          p_kind?: string
          p_payment_intent_id: string
          p_refund_id: string
        }
        Returns: {
          fully_refunded: boolean
          make_whole_cents: number
          order_amount_cents: number
          order_id: string
          order_status: string
          order_type: string
          post_hoc_cents: number
        }[]
      }
      record_waitlist_push_delivery: {
        Args: {
          p_claim_token: string
          p_endpoint_hash: string
          p_event_id: string
        }
        Returns: boolean
      }
      refresh_class_scoring_state: {
        Args: { p_class_id: string }
        Returns: undefined
      }
      refresh_class_scoring_state_authorized: {
        Args: { p_class_id: string }
        Returns: undefined
      }
      regenerate_show_passcodes: {
        Args: { p_show_id: string }
        Returns: {
          admin: string
          exhibitor: string
          judge: string
          steward: string
        }[]
      }
      renew_waitlist_notification_claim: {
        Args: { p_claim_token: string; p_event_id: string }
        Returns: boolean
      }
      reserve_askq_query: {
        Args: { p_query: string }
        Returns: {
          allowed: boolean
          daily_limit: number
          log_id: string
          remaining: number
          resets_at: string
        }[]
      }
      reserve_operator_support_query: {
        Args: never
        Returns: {
          allowed: boolean
          daily_limit: number
          log_id: string
          remaining: number
          resets_at: string
        }[]
      }
      resolve_class_result_visibility: {
        Args: { p_class_id: string }
        Returns: {
          faults_visible: boolean
          placement_visible: boolean
          qualification_visible: boolean
          time_visible: boolean
        }[]
      }
      resolve_operator_alert: {
        Args: { p_alert_id: string }
        Returns: {
          created_at: string
          dedupe_key: string | null
          detail: Json | null
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "operator_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_class: {
        Args: { p_class_id: string }
        Returns: {
          actual_end_time: string | null
          actual_start_time: string | null
          age_max: number | null
          age_min: number | null
          allow_waitlist: boolean | null
          breed_restrictions: string[] | null
          checked_in_count: number | null
          class_number: string | null
          competition_type: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          display_order: number | null
          distraction_count: number | null
          dogs_ahead_notification_count: number | null
          element: string | null
          entry_fee: number | null
          estimated_duration: number | null
          handler_age_max: number | null
          handler_age_min: number | null
          has_blank: boolean | null
          height_max: number | null
          height_min: number | null
          hides_known: boolean | null
          id: string
          is_results_reviewed: boolean | null
          is_scoring_finalized: boolean | null
          judge_name: string | null
          jump_heights: string[] | null
          level: string | null
          max_dogs_per_handler: number | null
          max_entries: number | null
          max_faults: number | null
          name: string
          num_areas: number | null
          num_hides: number | null
          qualifying_threshold: number | null
          reopened_after_closeout_at: string | null
          results_released_at: string | null
          results_released_by: string | null
          revised_expected_start: string | null
          scored_count: number | null
          section: string | null
          start_time: string | null
          status: string | null
          status_source: string
          time_limit_area2_seconds: number | null
          time_limit_area3_seconds: number | null
          time_limit_seconds: number | null
          timer_mode: string | null
          total_entries_count: number | null
          trial_id: string
          updated_at: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "classes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      restore_dog: {
        Args: { p_dog_id: string }
        Returns: {
          breed: string
          breeder_id: string | null
          call_name: string
          co_owner_id: string | null
          color: string | null
          created_at: string | null
          date_of_birth: string | null
          deceased: boolean | null
          deceased_date: string | null
          deleted_at: string | null
          deleted_by: string | null
          height: string | null
          id: string
          image_url: string | null
          license_key: string | null
          microchip_number: string | null
          name: string | null
          owner_id: string | null
          sex: string | null
          spayed_neutered: boolean | null
          status: string | null
          updated_at: string | null
          version: number
          weight: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dogs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      restore_person: {
        Args: { p_person_id: string }
        Returns: {
          agreed_to_tos_at: string | null
          auth_user_id: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          license_key: string | null
          phone: string | null
          profile_image: string | null
          state: string | null
          status: string
          street_address: string | null
          updated_at: string | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      restore_show: {
        Args: { p_show_id: string }
        Returns: {
          accent_color: string | null
          accept_cash_payments: boolean
          accept_check_payments: boolean
          address: string | null
          allow_non_owner_handlers: boolean | null
          brand_color: string
          cc_secretary_on_exhibitor_emails: boolean
          city: string | null
          club_id: string | null
          confirmation_message: string | null
          cover_image_url: string | null
          created_at: string | null
          day_of_show_fee: number | null
          default_judge_day_capacity: number
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          end_date: string
          entry_close_date: string | null
          entry_open_date: string | null
          experience_is_published: boolean
          experience_published_at: string | null
          experience_published_content: Json
          experience_published_style: string | null
          id: string
          is_nationals: boolean
          latitude: number | null
          license_key: string | null
          location: string | null
          logo_url: string | null
          longitude: number | null
          mail_in_auto_release: boolean
          mail_in_deadline: string | null
          mail_in_release_date: string | null
          mail_in_strategy: string | null
          mail_in_value: number | null
          max_entries_per_dog: number | null
          max_total_entries: number | null
          name: string
          organization: string
          pre_entry_fee: number | null
          published_premium_at: string | null
          published_premium_url: string | null
          results_released_at: string | null
          results_visible_to_all: boolean | null
          secretary_email: string | null
          start_date: string
          starting_armband_number: number
          state: string | null
          status: string | null
          style: string
          updated_at: string | null
          venue_name: string | null
          venue_wifi_network: string | null
          venue_wifi_password: string | null
          version: number
          waitlist_payment_deadline_hours: number
          withdrawal_cutoff_date: string | null
          withdrawal_policy_notes: string | null
          withdrawal_retention_type: string | null
          withdrawal_retention_value: number | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "shows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reverse_order_refund_cents: {
        Args: {
          p_amount_cents?: number
          p_kind?: string
          p_payment_intent_id: string
          p_refund_id: string
          p_terminal_state?: string
        }
        Returns: {
          make_whole_cents: number
          order_amount_cents: number
          order_id: string
          order_status: string
          post_hoc_cents: number
          reversed: boolean
        }[]
      }
      review_club_access_request: {
        Args: {
          p_club_name?: string
          p_decision: string
          p_existing_club_id?: string
          p_request_id: string
          p_review_note?: string
        }
        Returns: string
      }
      revoke_club_secretary: {
        Args: { p_club_id: string; p_person_id: string }
        Returns: undefined
      }
      ringside_claim_generation_current: { Args: never; Returns: boolean }
      ringside_containment_rearm: { Args: { p_reason: string }; Returns: Json }
      ringside_containment_sample: { Args: never; Returns: undefined }
      ringside_update_entry: {
        Args: { p_entry_id: string; p_expected_version: number; p_fields: Json }
        Returns: number
      }
      self_checkin_entry: {
        Args: { p_entry_id: string; p_new_status: string }
        Returns: undefined
      }
      set_entry_refund_decision: {
        Args: { p_decision: string; p_entry_id: string }
        Returns: undefined
      }
      soft_delete_class: { Args: { p_class_id: string }; Returns: undefined }
      soft_delete_dog: { Args: { p_dog_id: string }; Returns: undefined }
      soft_delete_person: {
        Args: { p_person_id: string }
        Returns: {
          agreed_to_tos_at: string | null
          auth_user_id: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          license_key: string | null
          phone: string | null
          profile_image: string | null
          state: string | null
          status: string
          street_address: string | null
          updated_at: string | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      soft_delete_show: { Args: { p_show_id: string }; Returns: undefined }
      stamp_show_refund_entries: {
        Args: { p_entry_ids: string[]; p_notes: string }
        Returns: number
      }
      submit_club_access_request: {
        Args: {
          p_request_note?: string
          p_requested_club_name: string
          p_requested_club_website?: string
        }
        Returns: string
      }
      submit_role_request: {
        Args: {
          p_club_id?: string
          p_requested_role: string
          p_requested_scope?: string
          p_requester_note?: string
          p_show_id?: string
        }
        Returns: string
      }
      submit_show_entries: {
        Args: {
          p_entries: Json
          p_payment_method: string
          p_registration_id: string
          p_show_id: string
          p_submission_id: string
        }
        Returns: Json
      }
      system_health_probe: { Args: never; Returns: Json }
      test_as_anon: { Args: never; Returns: undefined }
      test_as_user: { Args: { user_id: string }; Returns: undefined }
      test_reset: { Args: never; Returns: undefined }
      tv_board_entries: {
        Args: { p_class_ids: string[]; p_show_id: string }
        Returns: {
          armband: string
          class_id: string
          dog_call_name: string
          dog_image_url: string
          dog_name: string
          handler: string
          id: string
          is_in_ring: boolean
          is_scored: boolean
          run_order: number
        }[]
      }
      tv_class_entry_counts: {
        Args: { p_class_ids: string[]; p_show_id: string }
        Returns: {
          class_id: string
          entry_count: number
          scored_count: number
        }[]
      }
      update_entry_handler: {
        Args: { p_entry_id: string; p_handler: string }
        Returns: undefined
      }
      update_entry_handler_for_entry_management: {
        Args: {
          p_clear_handler_id?: boolean
          p_entry_id: string
          p_handler: string
          p_handler_id?: string
        }
        Returns: undefined
      }
      upsert_ringside_session: {
        Args: {
          p_favorited_armbands?: string[]
          p_passcode_or_null: string
          p_route?: string
          p_subscription_endpoint: string
        }
        Returns: {
          role: string
          show_id: string
        }[]
      }
      user_has_permission: {
        Args: {
          permission_name: string
          scope_id?: string
          scope_type?: string
          user_id: string
        }
        Returns: boolean
      }
      validate_passcode: {
        Args: { p_code: string }
        Returns: {
          passcode_generation: string
          role: string
          show_id: string
        }[]
      }
      validate_promo_code: {
        Args: { p_code: string; p_show_id?: string; p_trial_id?: string }
        Returns: {
          discount_type: string
          discount_value: number
          promo_code_id: string
          reason: string
          valid: boolean
        }[]
      }
      volunteer_show_id: { Args: { vol_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
