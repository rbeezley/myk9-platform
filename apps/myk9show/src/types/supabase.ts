export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      achievement: {
        Row: {
          abbreviation: string | null
          achievement_type: string
          certificate_number: string | null
          certificate_url: string | null
          created_at: string | null
          date_earned: string
          discipline: string | null
          dog_id: string | null
          id: string
          is_active: boolean | null
          judge_name: string | null
          level: string | null
          location: string | null
          notes: string | null
          organization: string
          points: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          abbreviation?: string | null
          achievement_type: string
          certificate_number?: string | null
          certificate_url?: string | null
          created_at?: string | null
          date_earned: string
          discipline?: string | null
          dog_id?: string | null
          id?: string
          is_active?: boolean | null
          judge_name?: string | null
          level?: string | null
          location?: string | null
          notes?: string | null
          organization: string
          points?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          abbreviation?: string | null
          achievement_type?: string
          certificate_number?: string | null
          certificate_url?: string | null
          created_at?: string | null
          date_earned?: string
          discipline?: string | null
          dog_id?: string | null
          id?: string
          is_active?: boolean | null
          judge_name?: string | null
          level?: string | null
          location?: string | null
          notes?: string | null
          organization?: string
          points?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
        ]
      }
      allergy: {
        Row: {
          allergen: string
          created_at: string | null
          discovered_by: string | null
          discovered_date: string | null
          dog_id: string | null
          health_record_id: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          reaction: string | null
          severity: string | null
          updated_at: string | null
        }
        Insert: {
          allergen: string
          created_at?: string | null
          discovered_by?: string | null
          discovered_date?: string | null
          dog_id?: string | null
          health_record_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          reaction?: string | null
          severity?: string | null
          updated_at?: string | null
        }
        Update: {
          allergen?: string
          created_at?: string | null
          discovered_by?: string | null
          discovered_date?: string | null
          dog_id?: string | null
          health_record_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          reaction?: string | null
          severity?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allergies_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergies_health_record_id_fkey"
            columns: ["health_record_id"]
            isOneToOne: false
            referencedRelation: "health_record"
            referencedColumns: ["id"]
          },
        ]
      }
      armband: {
        Row: {
          armband_color: string | null
          armband_number: string
          called_at: string | null
          called_to_ring: boolean | null
          check_in_status: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          class_id: string | null
          created_at: string | null
          entry_id: string | null
          id: string
          notes: string | null
          print_status: string | null
          printed_at: string | null
          printed_by: string | null
          reprint_count: number | null
          ring_assignment: string | null
          run_order: number | null
          special_instructions: string | null
          updated_at: string | null
        }
        Insert: {
          armband_color?: string | null
          armband_number: string
          called_at?: string | null
          called_to_ring?: boolean | null
          check_in_status?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          class_id?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          notes?: string | null
          print_status?: string | null
          printed_at?: string | null
          printed_by?: string | null
          reprint_count?: number | null
          ring_assignment?: string | null
          run_order?: number | null
          special_instructions?: string | null
          updated_at?: string | null
        }
        Update: {
          armband_color?: string | null
          armband_number?: string
          called_at?: string | null
          called_to_ring?: boolean | null
          check_in_status?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          class_id?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          notes?: string | null
          print_status?: string | null
          printed_at?: string | null
          printed_by?: string | null
          reprint_count?: number | null
          ring_assignment?: string | null
          run_order?: number | null
          special_instructions?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "armbands_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armbands_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_entry: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          request_method: string | null
          request_path: string | null
          risk_level: string | null
          sensitive_data: boolean | null
          session_id: string | null
          timestamp: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          request_method?: string | null
          request_path?: string | null
          risk_level?: string | null
          sensitive_data?: boolean | null
          session_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          request_method?: string | null
          request_path?: string | null
          risk_level?: string | null
          sensitive_data?: boolean | null
          session_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      class: {
        Row: {
          age_max: number | null
          age_min: number | null
          allows_waitlist: boolean | null
          breed_restrictions: string[] | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          entry_fee: number | null
          estimated_duration: number | null
          handler_age_max: number | null
          handler_age_min: number | null
          height_max: number | null
          height_min: number | null
          id: string
          jump_heights: string[] | null
          level: string | null
          max_dogs_per_handler: number | null
          max_entries: number | null
          name: string
          start_time: string | null
          trial_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          allows_waitlist?: boolean | null
          breed_restrictions?: string[] | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entry_fee?: number | null
          estimated_duration?: number | null
          handler_age_max?: number | null
          handler_age_min?: number | null
          height_max?: number | null
          height_min?: number | null
          id?: string
          jump_heights?: string[] | null
          level?: string | null
          max_dogs_per_handler?: number | null
          max_entries?: number | null
          name: string
          start_time?: string | null
          trial_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          allows_waitlist?: boolean | null
          breed_restrictions?: string[] | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          entry_fee?: number | null
          estimated_duration?: number | null
          handler_age_max?: number | null
          handler_age_min?: number | null
          height_max?: number | null
          height_min?: number | null
          id?: string
          jump_heights?: string[] | null
          level?: string | null
          max_dogs_per_handler?: number | null
          max_entries?: number | null
          name?: string
          start_time?: string | null
          trial_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trial"
            referencedColumns: ["id"]
          },
        ]
      }
      class_entry: {
        Row: {
          armband: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          entry_fee: number | null
          entry_id: string
          class_id: string
          id: string
          jump_height: string | null
          moved_from_class_id: string | null
          moved_to_class_id: string | null
          notes: string | null
          preferred_judge: string | null
          qualified_for_finals: boolean | null
          run_order: number | null
          status: string
          trial_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          armband?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null  
          entry_fee?: number | null
          entry_id: string
          class_id: string
          id?: string
          jump_height?: string | null
          moved_from_class_id?: string | null
          moved_to_class_id?: string | null
          notes?: string | null
          preferred_judge?: string | null
          qualified_for_finals?: boolean | null
          run_order?: number | null
          status?: string
          trial_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          armband?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          entry_fee?: number | null
          entry_id?: string
          class_id?: string
          id?: string
          jump_height?: string | null
          moved_from_class_id?: string | null
          moved_to_class_id?: string | null
          notes?: string | null
          preferred_judge?: string | null
          qualified_for_finals?: boolean | null
          run_order?: number | null
          status?: string
          trial_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_entry_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_entry_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_entry_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_entry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_entry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_entry_moved_from_class_id_fkey"
            columns: ["moved_from_class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_entry_moved_to_class_id_fkey"
            columns: ["moved_to_class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          }
        ]
      }
      class_template: {
        Row: {
          breed_restrictions: string[] | null
          class_pattern: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          entry_fee_default: number | null
          estimated_duration: number | null
          fields: Json | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          jump_heights: string[] | null
          max_entries_default: number | null
          name: string
          organization: string
          show_type: string | null
          start_time_default: string | null
          updated_at: string | null
        }
        Insert: {
          breed_restrictions?: string[] | null
          class_pattern?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entry_fee_default?: number | null
          estimated_duration?: number | null
          fields?: Json | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          jump_heights?: string[] | null
          max_entries_default?: number | null
          name: string
          organization: string
          show_type?: string | null
          start_time_default?: string | null
          updated_at?: string | null
        }
        Update: {
          breed_restrictions?: string[] | null
          class_pattern?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          entry_fee_default?: number | null
          estimated_duration?: number | null
          fields?: Json | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          jump_heights?: string[] | null
          max_entries_default?: number | null
          name?: string
          organization?: string
          show_type?: string | null
          start_time_default?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      club: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      competition: {
        Row: {
          class_id: string | null
          competition_date: string
          competition_name: string
          created_at: string | null
          discipline: string | null
          dog_id: string | null
          id: string
          judge_name: string | null
          level: string | null
          location: string | null
          notes: string | null
          organization: string | null
          placement: string | null
          points_earned: number | null
          qualified: boolean | null
          score: string | null
          show_id: string | null
          time_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          competition_date: string
          competition_name: string
          created_at?: string | null
          discipline?: string | null
          dog_id?: string | null
          id?: string
          judge_name?: string | null
          level?: string | null
          location?: string | null
          notes?: string | null
          organization?: string | null
          placement?: string | null
          points_earned?: number | null
          qualified?: boolean | null
          score?: string | null
          show_id?: string | null
          time_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          competition_date?: string
          competition_name?: string
          created_at?: string | null
          discipline?: string | null
          dog_id?: string | null
          id?: string
          judge_name?: string | null
          level?: string | null
          location?: string | null
          notes?: string | null
          organization?: string | null
          placement?: string | null
          points_earned?: number | null
          qualified?: boolean | null
          score?: string | null
          show_id?: string | null
          time_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
        ]
      }
      dog: {
        Row: {
          breed: string
          call_name: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          height: string | null
          id: string
          image_url: string | null
          is_spayed_neutered: boolean | null
          microchip_number: string | null
          name: string
          owner_id: string | null
          sex: string | null
          updated_at: string | null
          updated_by: string | null
          weight: string | null
        }
        Insert: {
          breed: string
          call_name?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          height?: string | null
          id?: string
          image_url?: string | null
          is_spayed_neutered?: boolean | null
          microchip_number?: string | null
          name: string
          owner_id?: string | null
          sex?: string | null
          updated_at?: string | null
          updated_by?: string | null
          weight?: string | null
        }
        Update: {
          breed?: string
          call_name?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          height?: string | null
          id?: string
          image_url?: string | null
          is_spayed_neutered?: boolean | null
          microchip_number?: string | null
          name?: string
          owner_id?: string | null
          sex?: string | null
          updated_at?: string | null
          updated_by?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_registration: {
        Row: {
          application_number: string | null
          breed: string | null
          certificate: string | null
          created_at: string | null
          dog_id: string | null
          id: string
          organization: string
          registered_name: string | null
          registration_date: string | null
          registration_number: string | null
          status: string | null
          submission_date: string | null
          updated_at: string | null
          variety: string | null
        }
        Insert: {
          application_number?: string | null
          breed?: string | null
          certificate?: string | null
          created_at?: string | null
          dog_id?: string | null
          id?: string
          organization: string
          registered_name?: string | null
          registration_date?: string | null
          registration_number?: string | null
          status?: string | null
          submission_date?: string | null
          updated_at?: string | null
          variety?: string | null
        }
        Update: {
          application_number?: string | null
          breed?: string | null
          certificate?: string | null
          created_at?: string | null
          dog_id?: string | null
          id?: string
          organization?: string
          registered_name?: string | null
          registration_date?: string | null
          registration_number?: string | null
          status?: string | null
          submission_date?: string | null
          updated_at?: string | null
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dog_registrations_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_entry: {
        Row: {
          auto_saved: boolean | null
          completion_percentage: number | null
          created_at: string | null
          draft_data: Json
          draft_name: string | null
          form_step: number | null
          id: string
          last_accessed_at: string | null
          show_id: string | null
          total_steps: number | null
          updated_at: string | null
          user_id: string
          validation_errors: Json | null
        }
        Insert: {
          auto_saved?: boolean | null
          completion_percentage?: number | null
          created_at?: string | null
          draft_data?: Json
          draft_name?: string | null
          form_step?: number | null
          id?: string
          last_accessed_at?: string | null
          show_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
          user_id: string
          validation_errors?: Json | null
        }
        Update: {
          auto_saved?: boolean | null
          completion_percentage?: number | null
          created_at?: string | null
          draft_data?: Json
          draft_name?: string | null
          form_step?: number | null
          id?: string
          last_accessed_at?: string | null
          show_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
          user_id?: string
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
        ]
      }
      entry: {
        Row: {
          armband: string | null
          class_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          dog_id: string | null
          entry_fee: number | null
          entry_status: string | null
          handler: string | null
          handler_id: string | null
          id: string
          jump_height: string | null
          move_up_requested: boolean | null
          payment_status: string | null
          preferred_judge: string | null
          run_order: number | null
          show_id: string | null
          special_requests: string | null
          status: string | null
          submitted_at: string | null
          total_fees: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          armband?: string | null
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          entry_fee?: number | null
          entry_status?: string | null
          handler?: string | null
          handler_id?: string | null
          id?: string
          jump_height?: string | null
          move_up_requested?: boolean | null
          payment_status?: string | null
          preferred_judge?: string | null
          run_order?: number | null
          show_id?: string | null
          special_requests?: string | null
          status?: string | null
          submitted_at?: string | null
          total_fees?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          armband?: string | null
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          entry_fee?: number | null
          entry_status?: string | null
          handler?: string | null
          handler_id?: string | null
          id?: string
          jump_height?: string | null
          move_up_requested?: boolean | null
          payment_status?: string | null
          preferred_judge?: string | null
          run_order?: number | null
          show_id?: string | null
          special_requests?: string | null
          status?: string | null
          submitted_at?: string | null
          total_fees?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_handler_id_fkey"
            columns: ["handler_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string
          created_at: string | null
          entry_id: string | null
          id: string
          previous_status: string | null
          reason: string | null
          status: string
        }
        Insert: {
          changed_at?: string | null
          changed_by: string
          created_at?: string | null
          entry_id?: string | null
          id?: string
          previous_status?: string | null
          reason?: string | null
          status: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string
          created_at?: string | null
          entry_id?: string | null
          id?: string
          previous_status?: string | null
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_status_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
        ]
      }
      fcm_tokens: {
        Row: {
          created_at: string | null
          device_info: Json | null
          device_type: string | null
          id: string
          is_active: boolean | null
          last_used: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          device_type?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          device_type?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      health_record: {
        Row: {
          created_at: string | null
          dog_id: string | null
          id: string
          notes: string | null
          record_type: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dog_id?: string | null
          id?: string
          notes?: string | null
          record_type: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dog_id?: string | null
          id?: string
          notes?: string | null
          record_type?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_records_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          actions_performed: number | null
          admin_user_id: string
          created_at: string | null
          data_accessed: string[] | null
          duration_minutes: number | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          ip_address: unknown | null
          is_active: boolean | null
          reason: string
          session_token: string | null
          started_at: string | null
          started_from: string | null
          target_user_id: string
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          actions_performed?: number | null
          admin_user_id: string
          created_at?: string | null
          data_accessed?: string[] | null
          duration_minutes?: number | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip_address?: unknown | null
          is_active?: boolean | null
          reason: string
          session_token?: string | null
          started_at?: string | null
          started_from?: string | null
          target_user_id: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          actions_performed?: number | null
          admin_user_id?: string
          created_at?: string | null
          data_accessed?: string[] | null
          duration_minutes?: number | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip_address?: unknown | null
          is_active?: boolean | null
          reason?: string
          session_token?: string | null
          started_at?: string | null
          started_from?: string | null
          target_user_id?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      judge_assignment: {
        Row: {
          assigned_classes: string[] | null
          assigned_rings: string[] | null
          assignment_date: string
          assignment_status: string | null
          assignment_type: string
          compensation_amount: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          expenses_covered: boolean | null
          id: string
          judge_id: string | null
          notes: string | null
          show_id: string | null
          special_requirements: string | null
          travel_provided: boolean | null
          updated_at: string | null
        }
        Insert: {
          assigned_classes?: string[] | null
          assigned_rings?: string[] | null
          assignment_date: string
          assignment_status?: string | null
          assignment_type: string
          compensation_amount?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          expenses_covered?: boolean | null
          id?: string
          judge_id?: string | null
          notes?: string | null
          show_id?: string | null
          special_requirements?: string | null
          travel_provided?: boolean | null
          updated_at?: string | null
        }
        Update: {
          assigned_classes?: string[] | null
          assigned_rings?: string[] | null
          assignment_date?: string
          assignment_status?: string | null
          assignment_type?: string
          compensation_amount?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          expenses_covered?: boolean | null
          id?: string
          judge_id?: string | null
          notes?: string | null
          show_id?: string | null
          special_requirements?: string | null
          travel_provided?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_certification: {
        Row: {
          certification_name: string
          certification_number: string | null
          continuing_education_hours: number | null
          created_at: string | null
          date_obtained: string
          expiration_date: string | null
          id: string
          is_active: boolean | null
          issuing_body: string
          next_renewal_date: string | null
          notes: string | null
          person_id: string | null
          renewal_required: boolean | null
          updated_at: string | null
        }
        Insert: {
          certification_name: string
          certification_number?: string | null
          continuing_education_hours?: number | null
          created_at?: string | null
          date_obtained: string
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          issuing_body: string
          next_renewal_date?: string | null
          notes?: string | null
          person_id?: string | null
          renewal_required?: boolean | null
          updated_at?: string | null
        }
        Update: {
          certification_name?: string
          certification_number?: string | null
          continuing_education_hours?: number | null
          created_at?: string | null
          date_obtained?: string
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          issuing_body?: string
          next_renewal_date?: string | null
          notes?: string | null
          person_id?: string | null
          renewal_required?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_certifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_certifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_qualification: {
        Row: {
          approval_number: string | null
          approved_by: string | null
          created_at: string | null
          date_obtained: string
          disciplines: string[]
          expiration_date: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          organization: string
          person_id: string | null
          qualification_level: string
          suspension_date: string | null
          suspension_reason: string | null
          updated_at: string | null
        }
        Insert: {
          approval_number?: string | null
          approved_by?: string | null
          created_at?: string | null
          date_obtained: string
          disciplines: string[]
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          organization: string
          person_id?: string | null
          qualification_level: string
          suspension_date?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_number?: string | null
          approved_by?: string | null
          created_at?: string | null
          date_obtained?: string
          disciplines?: string[]
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          organization?: string
          person_id?: string | null
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
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_qualifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      medication: {
        Row: {
          created_at: string | null
          dog_id: string | null
          dosage: string | null
          end_date: string | null
          frequency: string | null
          health_record_id: string | null
          id: string
          is_active: boolean | null
          medication_name: string
          notes: string | null
          pharmacy: string | null
          prescribed_by: string | null
          prescription_number: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dog_id?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          health_record_id?: string | null
          id?: string
          is_active?: boolean | null
          medication_name: string
          notes?: string | null
          pharmacy?: string | null
          prescribed_by?: string | null
          prescription_number?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dog_id?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          health_record_id?: string | null
          id?: string
          is_active?: boolean | null
          medication_name?: string
          notes?: string | null
          pharmacy?: string | null
          prescribed_by?: string | null
          prescription_number?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medications_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medications_health_record_id_fkey"
            columns: ["health_record_id"]
            isOneToOne: false
            referencedRelation: "health_record"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_log: {
        Row: {
          clicked_at: string | null
          created_at: string | null
          delivered_at: string | null
          dismissed_at: string | null
          error_code: string | null
          error_message: string | null
          fcm_message_id: string | null
          id: string
          metadata: Json | null
          queue_id: string | null
          sent_at: string | null
          status: string
          template_key: string
          user_id: string
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          fcm_message_id?: string | null
          id?: string
          metadata?: Json | null
          queue_id?: string | null
          sent_at?: string | null
          status: string
          template_key: string
          user_id: string
        }
        Update: {
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          fcm_message_id?: string | null
          id?: string
          metadata?: Json | null
          queue_id?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notification_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_event: {
        Row: {
          context: Json | null
          device_info: Json | null
          event_type: string
          id: string
          payload: Json | null
          session_id: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          device_info?: Json | null
          event_type: string
          id?: string
          payload?: Json | null
          session_id?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          device_info?: Json | null
          event_type?: string
          id?: string
          payload?: Json | null
          session_id?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_preference: {
        Row: {
          created_at: string | null
          delivery: Json | null
          enabled: boolean | null
          fcm_token: string | null
          id: string
          timing: Json | null
          topics: string[] | null
          types: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delivery?: Json | null
          enabled?: boolean | null
          fcm_token?: string | null
          id?: string
          timing?: Json | null
          topics?: string[] | null
          types?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delivery?: Json | null
          enabled?: boolean | null
          fcm_token?: string | null
          id?: string
          timing?: Json | null
          topics?: string[] | null
          types?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          fcm_message_id: string | null
          fcm_token: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number | null
          payload: Json
          scheduled_for: string | null
          status: string | null
          template_data: Json | null
          template_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          fcm_message_id?: string | null
          fcm_token?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number | null
          payload: Json
          scheduled_for?: string | null
          status?: string | null
          template_data?: Json | null
          template_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          fcm_message_id?: string | null
          fcm_token?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number | null
          payload?: Json
          scheduled_for?: string | null
          status?: string | null
          template_data?: Json | null
          template_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_template: {
        Row: {
          category: string | null
          config: Json | null
          created_at: string | null
          default_enabled: boolean | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          priority: string | null
          requires_permission: boolean | null
          template_key: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config?: Json | null
          created_at?: string | null
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          priority?: string | null
          requires_permission?: boolean | null
          template_key: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config?: Json | null
          created_at?: string | null
          default_enabled?: boolean | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: string | null
          requires_permission?: boolean | null
          template_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_trigger: {
        Row: {
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          event_type: string
          id: string
          is_active: boolean | null
          target_audience: Json | null
          template_key: string
          timing: Json | null
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          event_type: string
          id?: string
          is_active?: boolean | null
          target_audience?: Json | null
          template_key: string
          timing?: Json | null
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          event_type?: string
          id?: string
          is_active?: boolean | null
          target_audience?: Json | null
          template_key?: string
          timing?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_triggers_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "notification_template"
            referencedColumns: ["template_key"]
          },
        ]
      }
      offline_scoring: {
        Row: {
          class_id: string | null
          created_at: string | null
          device_info: Json | null
          entry_scores: Json | null
          id: string
          judge_id: string | null
          offline_timestamp: string
          scoring_data: Json
          session_name: string | null
          show_id: string | null
          sync_error: string | null
          sync_status: string | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          device_info?: Json | null
          entry_scores?: Json | null
          id?: string
          judge_id?: string | null
          offline_timestamp: string
          scoring_data: Json
          session_name?: string | null
          show_id?: string | null
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          device_info?: Json | null
          entry_scores?: Json | null
          id?: string
          judge_id?: string | null
          offline_timestamp?: string
          scoring_data?: Json
          session_name?: string | null
          show_id?: string | null
          sync_error?: string | null
          sync_status?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_scoring_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_scoring_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
        ]
      }
      past_result: {
        Row: {
          class_level: string | null
          class_name: string
          created_at: string | null
          dog_id: string | null
          external_id: string | null
          id: string
          imported_from: string | null
          judge_name: string | null
          notes: string | null
          placement: string | null
          qualified: boolean | null
          score: string | null
          show_date: string
          show_id: string | null
          show_location: string | null
          show_name: string
          updated_at: string | null
        }
        Insert: {
          class_level?: string | null
          class_name: string
          created_at?: string | null
          dog_id?: string | null
          external_id?: string | null
          id?: string
          imported_from?: string | null
          judge_name?: string | null
          notes?: string | null
          placement?: string | null
          qualified?: boolean | null
          score?: string | null
          show_date: string
          show_id?: string | null
          show_location?: string | null
          show_name: string
          updated_at?: string | null
        }
        Update: {
          class_level?: string | null
          class_name?: string
          created_at?: string | null
          dog_id?: string | null
          external_id?: string | null
          id?: string
          imported_from?: string | null
          judge_name?: string | null
          notes?: string | null
          placement?: string | null
          qualified?: boolean | null
          score?: string | null
          show_date?: string
          show_id?: string | null
          show_location?: string | null
          show_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "past_results_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "past_results_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
        ]
      }
      permission: {
        Row: {
          action: string
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          is_system: boolean | null
          name: string
          resource: string
        }
        Insert: {
          action: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_system?: boolean | null
          name: string
          resource: string
        }
        Update: {
          action?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_system?: boolean | null
          name?: string
          resource?: string
        }
        Relationships: []
      }
      permission_audit_log: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          scope_id: string | null
          scope_type: string | null
          target_permission_id: string | null
          target_role_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          scope_id?: string | null
          scope_type?: string | null
          target_permission_id?: string | null
          target_role_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          scope_id?: string | null
          scope_type?: string | null
          target_permission_id?: string | null
          target_role_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_audit_log_target_permission_id_fkey"
            columns: ["target_permission_id"]
            isOneToOne: false
            referencedRelation: "permission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_audit_log_target_role_id_fkey"
            columns: ["target_role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
        ]
      }
      result: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          end_time: string | null
          entry_id: string | null
          faults: number | null
          id: string
          judge_notes: string | null
          placement: string | null
          qualification: string | null
          qualification_reason: string | null
          qualified: boolean | null
          recorded_at: string | null
          recorded_by: string
          score: string | null
          start_time: string | null
          time_seconds: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          end_time?: string | null
          entry_id?: string | null
          faults?: number | null
          id?: string
          judge_notes?: string | null
          placement?: string | null
          qualification?: string | null
          qualification_reason?: string | null
          qualified?: boolean | null
          recorded_at?: string | null
          recorded_by: string
          score?: string | null
          start_time?: string | null
          time_seconds?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          end_time?: string | null
          entry_id?: string | null
          faults?: number | null
          id?: string
          judge_notes?: string | null
          placement?: string | null
          qualification?: string | null
          qualification_reason?: string | null
          qualified?: boolean | null
          recorded_at?: string | null
          recorded_by?: string
          score?: string | null
          start_time?: string | null
          time_seconds?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "result_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entry"
            referencedColumns: ["id"]
          },
        ]
      }
      role: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      role_permission: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          permission_id: string | null
          role_id: string | null
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_id?: string | null
          role_id?: string | null
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_id?: string | null
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
        ]
      }
      search_analytics: {
        Row: {
          avg_click_position: number | null
          avg_results_count: number | null
          avg_search_duration_ms: number | null
          created_at: string | null
          first_searched_at: string | null
          frequency: number | null
          id: string
          last_aggregated_at: string | null
          last_searched_at: string | null
          search_term: string
          search_type: string
          success_rate: number | null
          successful_searches: number | null
          total_searches: number | null
          updated_at: string | null
        }
        Insert: {
          avg_click_position?: number | null
          avg_results_count?: number | null
          avg_search_duration_ms?: number | null
          created_at?: string | null
          first_searched_at?: string | null
          frequency?: number | null
          id?: string
          last_aggregated_at?: string | null
          last_searched_at?: string | null
          search_term: string
          search_type: string
          success_rate?: number | null
          successful_searches?: number | null
          total_searches?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_click_position?: number | null
          avg_results_count?: number | null
          avg_search_duration_ms?: number | null
          created_at?: string | null
          first_searched_at?: string | null
          frequency?: number | null
          id?: string
          last_aggregated_at?: string | null
          last_searched_at?: string | null
          search_term?: string
          search_type?: string
          success_rate?: number | null
          successful_searches?: number | null
          total_searches?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          clicked_result_id: string | null
          clicked_result_position: number | null
          created_at: string | null
          id: string
          results_count: number | null
          results_found: boolean | null
          search_context: string | null
          search_duration_ms: number | null
          search_filters: Json | null
          search_sort: Json | null
          search_term: string
          search_type: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          clicked_result_id?: string | null
          clicked_result_position?: number | null
          created_at?: string | null
          id?: string
          results_count?: number | null
          results_found?: boolean | null
          search_context?: string | null
          search_duration_ms?: number | null
          search_filters?: Json | null
          search_sort?: Json | null
          search_term: string
          search_type: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          clicked_result_id?: string | null
          clicked_result_position?: number | null
          created_at?: string | null
          id?: string
          results_count?: number | null
          results_found?: boolean | null
          search_context?: string | null
          search_duration_ms?: number | null
          search_filters?: Json | null
          search_sort?: Json | null
          search_term?: string
          search_type?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      show: {
        Row: {
          allows_non_owner_handlers: boolean | null
          chairman: string | null
          chief_steward: string | null
          club_id: string | null
          created_at: string | null
          created_by: string | null
          day_of_show_fee: number | null
          deleted_at: string | null
          end_date: string
          entry_close_date: string | null
          entry_open_date: string | null
          id: string
          location: string | null
          max_entries_per_dog: number | null
          max_total_entries: number | null
          name: string
          pre_entry_fee: number | null
          secretary: string | null
          start_date: string
          status: string | null
          type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allows_non_owner_handlers?: boolean | null
          chairman?: string | null
          chief_steward?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_show_fee?: number | null
          deleted_at?: string | null
          end_date: string
          entry_close_date?: string | null
          entry_open_date?: string | null
          id?: string
          location?: string | null
          max_entries_per_dog?: number | null
          max_total_entries?: number | null
          name: string
          pre_entry_fee?: number | null
          secretary?: string | null
          start_date: string
          status?: string | null
          type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allows_non_owner_handlers?: boolean | null
          chairman?: string | null
          chief_steward?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_show_fee?: number | null
          deleted_at?: string | null
          end_date?: string
          entry_close_date?: string | null
          entry_open_date?: string | null
          id?: string
          location?: string | null
          max_entries_per_dog?: number | null
          max_total_entries?: number | null
          name?: string
          pre_entry_fee?: number | null
          secretary?: string | null
          start_date?: string
          status?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      show_registration: {
        Row: {
          check_in_time: string | null
          checked_in: boolean | null
          created_at: string | null
          dietary_requirements: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          number_of_entries: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          person_id: string | null
          preferred_contact_method: string | null
          registration_date: string
          registration_type: string
          show_id: string | null
          special_requests: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          check_in_time?: string | null
          checked_in?: boolean | null
          created_at?: string | null
          dietary_requirements?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          number_of_entries?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          person_id?: string | null
          preferred_contact_method?: string | null
          registration_date?: string
          registration_type: string
          show_id?: string | null
          special_requests?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          check_in_time?: string | null
          checked_in?: boolean | null
          created_at?: string | null
          dietary_requirements?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          number_of_entries?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          person_id?: string | null
          preferred_contact_method?: string | null
          registration_date?: string
          registration_type?: string
          show_id?: string | null
          special_requests?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_registrations_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
        ]
      }
      show_template: {
        Row: {
          created_at: string | null
          created_by: string | null
          default_duration_days: number | null
          default_entry_fee: number | null
          default_max_entries: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          last_used_at: string | null
          name: string
          organization: string
          template_data: Json | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          default_duration_days?: number | null
          default_entry_fee?: number | null
          default_max_entries?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          last_used_at?: string | null
          name: string
          organization: string
          template_data?: Json | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          default_duration_days?: number | null
          default_entry_fee?: number | null
          default_max_entries?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          last_used_at?: string | null
          name?: string
          organization?: string
          template_data?: Json | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      stripe_customers: {
        Row: {
          created_at: string | null
          customer_id: string
          deleted_at: string | null
          id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: never
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stripe_orders: {
        Row: {
          amount_subtotal: number
          amount_total: number
          checkout_session_id: string
          created_at: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          id: number
          payment_intent_id: string
          payment_status: string
          status: Database["public"]["Enums"]["stripe_order_status"]
          updated_at: string | null
        }
        Insert: {
          amount_subtotal: number
          amount_total: number
          checkout_session_id: string
          created_at?: string | null
          currency: string
          customer_id: string
          deleted_at?: string | null
          id?: never
          payment_intent_id: string
          payment_status: string
          status?: Database["public"]["Enums"]["stripe_order_status"]
          updated_at?: string | null
        }
        Update: {
          amount_subtotal?: number
          amount_total?: number
          checkout_session_id?: string
          created_at?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          id?: never
          payment_intent_id?: string
          payment_status?: string
          status?: Database["public"]["Enums"]["stripe_order_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      stripe_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: number | null
          current_period_start: number | null
          customer_id: string
          deleted_at: string | null
          id: number
          payment_method_brand: string | null
          payment_method_last4: string | null
          price_id: string | null
          status: Database["public"]["Enums"]["stripe_subscription_status"]
          subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: number | null
          current_period_start?: number | null
          customer_id: string
          deleted_at?: string | null
          id?: never
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          price_id?: string | null
          status: Database["public"]["Enums"]["stripe_subscription_status"]
          subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: number | null
          current_period_start?: number | null
          customer_id?: string
          deleted_at?: string | null
          id?: never
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          price_id?: string | null
          status?: Database["public"]["Enums"]["stripe_subscription_status"]
          subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_conflict: {
        Row: {
          conflict_data: Json | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          local_data: Json | null
          local_version: number | null
          remote_data: Json | null
          remote_version: number | null
          resolution_strategy: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_data: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          conflict_data?: Json | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          local_data?: Json | null
          local_version?: number | null
          remote_data?: Json | null
          remote_version?: number | null
          resolution_strategy?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          conflict_data?: Json | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          local_data?: Json | null
          local_version?: number | null
          remote_data?: Json | null
          remote_version?: number | null
          resolution_strategy?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          created_at: string | null
          data: Json | null
          entity_id: string
          entity_type: string
          error_details: Json | null
          id: string
          last_error: string | null
          max_retries: number | null
          next_retry_at: string | null
          operation: string
          priority: string | null
          processed_at: string | null
          retry_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          entity_id: string
          entity_type: string
          error_details?: Json | null
          id?: string
          last_error?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          operation: string
          priority?: string | null
          processed_at?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          entity_id?: string
          entity_type?: string
          error_details?: Json | null
          id?: string
          last_error?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          operation?: string
          priority?: string | null
          processed_at?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_alert: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          id: string
          message: string
          metadata: Json | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: number | null
          source: string
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: number | null
          source: string
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: number | null
          source?: string
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      template_field: {
        Row: {
          created_at: string | null
          default_value: string | null
          field_description: string | null
          field_group: string | null
          field_label: string
          field_name: string
          field_order: number | null
          field_type: string
          field_values: Json | null
          id: string
          is_active: boolean | null
          is_optional: boolean | null
          is_required: boolean | null
          template_id: string | null
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          field_description?: string | null
          field_group?: string | null
          field_label: string
          field_name: string
          field_order?: number | null
          field_type: string
          field_values?: Json | null
          id?: string
          is_active?: boolean | null
          is_optional?: boolean | null
          is_required?: boolean | null
          template_id?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          field_description?: string | null
          field_group?: string | null
          field_label?: string
          field_name?: string
          field_order?: number | null
          field_type?: string
          field_values?: Json | null
          id?: string
          is_active?: boolean | null
          is_optional?: boolean | null
          is_required?: boolean | null
          template_id?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "class_template"
            referencedColumns: ["id"]
          },
        ]
      }
      test_table: {
        Row: {
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      trial: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          deleted_at: string | null
          id: string
          max_entries_per_dog: number | null
          max_entries_per_handler: number | null
          max_total_entries: number | null
          name: string
          show_id: string | null
          status: string | null
          trial_number: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          deleted_at?: string | null
          id?: string
          max_entries_per_dog?: number | null
          max_entries_per_handler?: number | null
          max_total_entries?: number | null
          name: string
          show_id?: string | null
          status?: string | null
          trial_number?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          id?: string
          max_entries_per_dog?: number | null
          max_entries_per_handler?: number | null
          max_total_entries?: number | null
          name?: string
          show_id?: string | null
          status?: string | null
          trial_number?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "show"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          city: string | null
          club_affiliations: string[] | null
          country: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          emergency_contact: Json | null
          first_name: string
          id: string
          judge_info: Json | null
          last_name: string
          membership_id: string | null
          phone: string | null
          profile_image: string | null
          roles: string[] | null
          state: string | null
          street_address: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          club_affiliations?: string[] | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name: string
          id?: string
          judge_info?: Json | null
          last_name: string
          membership_id?: string | null
          phone?: string | null
          profile_image?: string | null
          roles?: string[] | null
          state?: string | null
          street_address?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          club_affiliations?: string[] | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string
          id?: string
          judge_info?: Json | null
          last_name?: string
          membership_id?: string | null
          phone?: string | null
          profile_image?: string | null
          roles?: string[] | null
          state?: string | null
          street_address?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preference: {
        Row: {
          created_at: string | null
          id: string
          last_updated_device: string | null
          preference_data: Json
          preference_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_updated_device?: string | null
          preference_data?: Json
          preference_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_updated_device?: string | null
          preference_data?: Json
          preference_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_role: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          role_id: string | null
          scope_id: string | null
          scope_type: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          role_id?: string | null
          scope_id?: string | null
          scope_type?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          role_id?: string | null
          scope_id?: string | null
          scope_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
        ]
      }
      vaccination: {
        Row: {
          clinic_address: string | null
          clinic_name: string | null
          created_at: string | null
          date_given: string
          dog_id: string | null
          expiration_date: string | null
          health_record_id: string | null
          id: string
          lot_number: string | null
          manufacturer: string | null
          notes: string | null
          updated_at: string | null
          vaccine_name: string
          vet_name: string | null
        }
        Insert: {
          clinic_address?: string | null
          clinic_name?: string | null
          created_at?: string | null
          date_given: string
          dog_id?: string | null
          expiration_date?: string | null
          health_record_id?: string | null
          id?: string
          lot_number?: string | null
          manufacturer?: string | null
          notes?: string | null
          updated_at?: string | null
          vaccine_name: string
          vet_name?: string | null
        }
        Update: {
          clinic_address?: string | null
          clinic_name?: string | null
          created_at?: string | null
          date_given?: string
          dog_id?: string | null
          expiration_date?: string | null
          health_record_id?: string | null
          id?: string
          lot_number?: string | null
          manufacturer?: string | null
          notes?: string | null
          updated_at?: string | null
          vaccine_name?: string
          vet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vaccinations_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vaccinations_health_record_id_fkey"
            columns: ["health_record_id"]
            isOneToOne: false
            referencedRelation: "health_record"
            referencedColumns: ["id"]
          },
        ]
      }
      vet_visit: {
        Row: {
          clinic_address: string | null
          clinic_name: string | null
          clinic_phone: string | null
          cost: number | null
          created_at: string | null
          diagnosis: string | null
          dog_id: string | null
          follow_up_date: string | null
          follow_up_notes: string | null
          health_record_id: string | null
          id: string
          notes: string | null
          reason: string
          requires_follow_up: boolean | null
          treatment: string | null
          updated_at: string | null
          vet_name: string | null
          visit_date: string
        }
        Insert: {
          clinic_address?: string | null
          clinic_name?: string | null
          clinic_phone?: string | null
          cost?: number | null
          created_at?: string | null
          diagnosis?: string | null
          dog_id?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          health_record_id?: string | null
          id?: string
          notes?: string | null
          reason: string
          requires_follow_up?: boolean | null
          treatment?: string | null
          updated_at?: string | null
          vet_name?: string | null
          visit_date: string
        }
        Update: {
          clinic_address?: string | null
          clinic_name?: string | null
          clinic_phone?: string | null
          cost?: number | null
          created_at?: string | null
          diagnosis?: string | null
          dog_id?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          health_record_id?: string | null
          id?: string
          notes?: string | null
          reason?: string
          requires_follow_up?: boolean | null
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
            referencedRelation: "dog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vet_visits_health_record_id_fkey"
            columns: ["health_record_id"]
            isOneToOne: false
            referencedRelation: "health_record"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      stripe_user_orders: {
        Row: {
          amount_subtotal: number | null
          amount_total: number | null
          checkout_session_id: string | null
          currency: string | null
          customer_id: string | null
          order_date: string | null
          order_id: number | null
          order_status:
            | Database["public"]["Enums"]["stripe_order_status"]
            | null
          payment_intent_id: string | null
          payment_status: string | null
        }
        Relationships: []
      }
      stripe_user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          current_period_end: number | null
          current_period_start: number | null
          customer_id: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          price_id: string | null
          subscription_id: string | null
          subscription_status:
            | Database["public"]["Enums"]["stripe_subscription_status"]
            | null
        }
        Relationships: []
      }
      test_view: {
        Row: {
          created_at: string | null
          id: number | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number | null
          name?: string | null
        }
        Relationships: []
      }
      user_roles_view: {
        Row: {
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          role_display_names: string[] | null
          roles: string[] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_user_role: {
        Args: {
          target_user_id: string
          role_name: string
          scope_type?: string
          scope_id?: string
          expires_at?: string
          assigned_by_user_id?: string
        }
        Returns: string
      }
      get_effective_permissions: {
        Args: {
          user_id: string
          filter_scope_type?: string
          filter_scope_id?: string
        }
        Returns: {
          permission_name: string
        }[]
      }
      get_user_permissions: {
        Args: {
          user_id: string
          filter_scope_type?: string
          filter_scope_id?: string
        }
        Returns: {
          permission_name: string
          permission_display_name: string
          resource: string
          action: string
          role_name: string
          role_display_name: string
          scope_type: string
          scope_id: string
        }[]
      }
      get_user_roles: {
        Args: { user_id: string }
        Returns: {
          role_id: string
          role_name: string
          role_display_name: string
          scope_type: string
          scope_id: string
          assigned_at: string
          expires_at: string
          is_active: boolean
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      is_site_admin: {
        Args: { user_id: string }
        Returns: boolean
      }
      revoke_user_role: {
        Args: {
          target_user_id: string
          role_name: string
          scope_type?: string
          scope_id?: string
          revoked_by_user_id?: string
        }
        Returns: boolean
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      user_has_permission: {
        Args: {
          user_id: string
          permission_name: string
          scope_type?: string
          scope_id?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      stripe_order_status: "pending" | "completed" | "canceled"
      stripe_subscription_status:
        | "not_started"
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused"
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
      stripe_order_status: ["pending", "completed", "canceled"],
      stripe_subscription_status: [
        "not_started",
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
    },
  },
} as const
