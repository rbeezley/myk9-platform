export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          certificate_number: string | null;
          created_at: string | null;
          date_earned: string | null;
          dog_id: string;
          id: string;
          notes: string | null;
          organization: string | null;
          sport: string | null;
          title: string;
        };
        Insert: {
          certificate_number?: string | null;
          created_at?: string | null;
          date_earned?: string | null;
          dog_id: string;
          id?: string;
          notes?: string | null;
          organization?: string | null;
          sport?: string | null;
          title: string;
        };
        Update: {
          certificate_number?: string | null;
          created_at?: string | null;
          date_earned?: string | null;
          dog_id?: string;
          id?: string;
          notes?: string | null;
          organization?: string | null;
          sport?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'achievements_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      allergies: {
        Row: {
          allergen: string;
          created_at: string | null;
          diagnosed_date: string | null;
          dog_id: string;
          id: string;
          notes: string | null;
          reaction: string | null;
          severity: string | null;
        };
        Insert: {
          allergen: string;
          created_at?: string | null;
          diagnosed_date?: string | null;
          dog_id: string;
          id?: string;
          notes?: string | null;
          reaction?: string | null;
          severity?: string | null;
        };
        Update: {
          allergen?: string;
          created_at?: string | null;
          diagnosed_date?: string | null;
          dog_id?: string;
          id?: string;
          notes?: string | null;
          reaction?: string | null;
          severity?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'allergies_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      announcement_reads: {
        Row: {
          announcement_id: string;
          id: string;
          read_at: string | null;
          user_id: string | null;
        };
        Insert: {
          announcement_id: string;
          id?: string;
          read_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          announcement_id?: string;
          id?: string;
          read_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'announcement_reads_announcement_id_fkey';
            columns: ['announcement_id'];
            isOneToOne: false;
            referencedRelation: 'announcements';
            referencedColumns: ['id'];
          },
        ];
      };
      announcements: {
        Row: {
          content: string;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          is_published: boolean | null;
          license_key: string | null;
          priority: string | null;
          published_at: string | null;
          show_id: string | null;
          target_audience: string[] | null;
          title: string;
          trial_id: string | null;
          type: string | null;
          updated_at: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_published?: boolean | null;
          license_key?: string | null;
          priority?: string | null;
          published_at?: string | null;
          show_id?: string | null;
          target_audience?: string[] | null;
          title: string;
          trial_id?: string | null;
          type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          is_published?: boolean | null;
          license_key?: string | null;
          priority?: string | null;
          published_at?: string | null;
          show_id?: string | null;
          target_audience?: string[] | null;
          title?: string;
          trial_id?: string | null;
          type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'announcements_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'announcements_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
      armbands: {
        Row: {
          armband_number: string;
          assigned_at: string | null;
          created_at: string | null;
          dog_id: string | null;
          entry_id: string | null;
          id: string;
          is_available: boolean | null;
          show_id: string;
          trial_id: string | null;
        };
        Insert: {
          armband_number: string;
          assigned_at?: string | null;
          created_at?: string | null;
          dog_id?: string | null;
          entry_id?: string | null;
          id?: string;
          is_available?: boolean | null;
          show_id: string;
          trial_id?: string | null;
        };
        Update: {
          armband_number?: string;
          assigned_at?: string | null;
          created_at?: string | null;
          dog_id?: string | null;
          entry_id?: string | null;
          id?: string;
          is_available?: boolean | null;
          show_id?: string;
          trial_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'armbands_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'armbands_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'armbands_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'view_entry_with_results';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'armbands_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'armbands_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
      class_result_visibility_overrides: {
        Row: {
          class_id: string;
          created_at: string | null;
          id: string;
          release_at: string | null;
          visibility: string | null;
        };
        Insert: {
          class_id: string;
          created_at?: string | null;
          id?: string;
          release_at?: string | null;
          visibility?: string | null;
        };
        Update: {
          class_id?: string;
          created_at?: string | null;
          id?: string;
          release_at?: string | null;
          visibility?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'class_result_visibility_overrides_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: true;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      class_templates: {
        Row: {
          competition_type: string | null;
          created_at: string | null;
          created_by: string | null;
          default_entry_fee: number | null;
          default_max_entries: number | null;
          default_time_limit_seconds: number | null;
          description: string | null;
          element: string | null;
          id: string;
          is_public: boolean | null;
          level: string | null;
          name: string;
          template_data: Json | null;
          updated_at: string | null;
        };
        Insert: {
          competition_type?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          default_entry_fee?: number | null;
          default_max_entries?: number | null;
          default_time_limit_seconds?: number | null;
          description?: string | null;
          element?: string | null;
          id?: string;
          is_public?: boolean | null;
          level?: string | null;
          name: string;
          template_data?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          competition_type?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          default_entry_fee?: number | null;
          default_max_entries?: number | null;
          default_time_limit_seconds?: number | null;
          description?: string | null;
          element?: string | null;
          id?: string;
          is_public?: boolean | null;
          level?: string | null;
          name?: string;
          template_data?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'class_templates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      classes: {
        Row: {
          actual_end_time: string | null;
          actual_start_time: string | null;
          age_max: number | null;
          age_min: number | null;
          allow_waitlist: boolean | null;
          breed_restrictions: string[] | null;
          checked_in_count: number | null;
          class_number: string | null;
          competition_type: string | null;
          created_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          division: string | null;
          dogs_ahead_notification_count: number | null;
          element: string | null;
          entry_fee: number | null;
          estimated_duration: number | null;
          handler_age_max: number | null;
          handler_age_min: number | null;
          has_blank: boolean | null;
          height_max: number | null;
          height_min: number | null;
          id: string;
          is_results_reviewed: boolean | null;
          is_scoring_finalized: boolean | null;
          jump_heights: string[] | null;
          level: string | null;
          max_dogs_per_handler: number | null;
          max_entries: number | null;
          max_faults: number | null;
          name: string;
          num_areas: number | null;
          num_hides: number | null;
          qualifying_threshold: number | null;
          results_released_at: string | null;
          scored_count: number | null;
          start_time: string | null;
          status: string | null;
          time_limit_seconds: number | null;
          total_entries_count: number | null;
          trial_id: string;
          updated_at: string | null;
        };
        Insert: {
          actual_end_time?: string | null;
          actual_start_time?: string | null;
          age_max?: number | null;
          age_min?: number | null;
          allow_waitlist?: boolean | null;
          breed_restrictions?: string[] | null;
          checked_in_count?: number | null;
          class_number?: string | null;
          competition_type?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          division?: string | null;
          dogs_ahead_notification_count?: number | null;
          element?: string | null;
          entry_fee?: number | null;
          estimated_duration?: number | null;
          handler_age_max?: number | null;
          handler_age_min?: number | null;
          has_blank?: boolean | null;
          height_max?: number | null;
          height_min?: number | null;
          id?: string;
          is_results_reviewed?: boolean | null;
          is_scoring_finalized?: boolean | null;
          jump_heights?: string[] | null;
          level?: string | null;
          max_dogs_per_handler?: number | null;
          max_entries?: number | null;
          max_faults?: number | null;
          name: string;
          num_areas?: number | null;
          num_hides?: number | null;
          qualifying_threshold?: number | null;
          results_released_at?: string | null;
          scored_count?: number | null;
          start_time?: string | null;
          status?: string | null;
          time_limit_seconds?: number | null;
          total_entries_count?: number | null;
          trial_id: string;
          updated_at?: string | null;
        };
        Update: {
          actual_end_time?: string | null;
          actual_start_time?: string | null;
          age_max?: number | null;
          age_min?: number | null;
          allow_waitlist?: boolean | null;
          breed_restrictions?: string[] | null;
          checked_in_count?: number | null;
          class_number?: string | null;
          competition_type?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          division?: string | null;
          dogs_ahead_notification_count?: number | null;
          element?: string | null;
          entry_fee?: number | null;
          estimated_duration?: number | null;
          handler_age_max?: number | null;
          handler_age_min?: number | null;
          has_blank?: boolean | null;
          height_max?: number | null;
          height_min?: number | null;
          id?: string;
          is_results_reviewed?: boolean | null;
          is_scoring_finalized?: boolean | null;
          jump_heights?: string[] | null;
          level?: string | null;
          max_dogs_per_handler?: number | null;
          max_entries?: number | null;
          max_faults?: number | null;
          name?: string;
          num_areas?: number | null;
          num_hides?: number | null;
          qualifying_threshold?: number | null;
          results_released_at?: string | null;
          scored_count?: number | null;
          start_time?: string | null;
          status?: string | null;
          time_limit_seconds?: number | null;
          total_entries_count?: number | null;
          trial_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'classes_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
      clubs: {
        Row: {
          address: string | null;
          city: string | null;
          club_number: string | null;
          created_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          email: string | null;
          id: string;
          license_key: string | null;
          logo_url: string | null;
          name: string;
          phone: string | null;
          state: string | null;
          updated_at: string | null;
          website: string | null;
          zip_code: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          club_number?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          email?: string | null;
          id?: string;
          license_key?: string | null;
          logo_url?: string | null;
          name: string;
          phone?: string | null;
          state?: string | null;
          updated_at?: string | null;
          website?: string | null;
          zip_code?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          club_number?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          email?: string | null;
          id?: string;
          license_key?: string | null;
          logo_url?: string | null;
          name?: string;
          phone?: string | null;
          state?: string | null;
          updated_at?: string | null;
          website?: string | null;
          zip_code?: string | null;
        };
        Relationships: [];
      };
      dog_registrations: {
        Row: {
          created_at: string | null;
          dog_id: string;
          id: string;
          organization: string;
          registration_date: string | null;
          registration_number: string;
          updated_at: string | null;
          verified: boolean | null;
        };
        Insert: {
          created_at?: string | null;
          dog_id: string;
          id?: string;
          organization: string;
          registration_date?: string | null;
          registration_number: string;
          updated_at?: string | null;
          verified?: boolean | null;
        };
        Update: {
          created_at?: string | null;
          dog_id?: string;
          id?: string;
          organization?: string;
          registration_date?: string | null;
          registration_number?: string;
          updated_at?: string | null;
          verified?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'dog_registrations_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      dogs: {
        Row: {
          akc_number: string | null;
          breed: string;
          breeder_id: string | null;
          call_name: string | null;
          co_owner_id: string | null;
          color: string | null;
          created_at: string | null;
          date_of_birth: string | null;
          deceased: boolean | null;
          deceased_date: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          height: string | null;
          id: string;
          image_url: string | null;
          license_key: string | null;
          microchip_number: string | null;
          name: string;
          other_registry: string | null;
          other_registry_number: string | null;
          owner_id: string | null;
          sex: string | null;
          spayed_neutered: boolean | null;
          ukc_number: string | null;
          updated_at: string | null;
          weight: string | null;
        };
        Insert: {
          akc_number?: string | null;
          breed: string;
          breeder_id?: string | null;
          call_name?: string | null;
          co_owner_id?: string | null;
          color?: string | null;
          created_at?: string | null;
          date_of_birth?: string | null;
          deceased?: boolean | null;
          deceased_date?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          height?: string | null;
          id?: string;
          image_url?: string | null;
          license_key?: string | null;
          microchip_number?: string | null;
          name: string;
          other_registry?: string | null;
          other_registry_number?: string | null;
          owner_id?: string | null;
          sex?: string | null;
          spayed_neutered?: boolean | null;
          ukc_number?: string | null;
          updated_at?: string | null;
          weight?: string | null;
        };
        Update: {
          akc_number?: string | null;
          breed?: string;
          breeder_id?: string | null;
          call_name?: string | null;
          co_owner_id?: string | null;
          color?: string | null;
          created_at?: string | null;
          date_of_birth?: string | null;
          deceased?: boolean | null;
          deceased_date?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          height?: string | null;
          id?: string;
          image_url?: string | null;
          license_key?: string | null;
          microchip_number?: string | null;
          name?: string;
          other_registry?: string | null;
          other_registry_number?: string | null;
          owner_id?: string | null;
          sex?: string | null;
          spayed_neutered?: boolean | null;
          ukc_number?: string | null;
          updated_at?: string | null;
          weight?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'dogs_breeder_id_fkey';
            columns: ['breeder_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dogs_co_owner_id_fkey';
            columns: ['co_owner_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dogs_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      entries: {
        Row: {
          area1_correct: number | null;
          area1_faults: number | null;
          area1_incorrect: number | null;
          area1_time_seconds: number | null;
          area2_correct: number | null;
          area2_faults: number | null;
          area2_incorrect: number | null;
          area2_time_seconds: number | null;
          area3_correct: number | null;
          area3_faults: number | null;
          area3_incorrect: number | null;
          area3_time_seconds: number | null;
          area4_time_seconds: number | null;
          armband: string | null;
          bonus_points: number | null;
          class_id: string | null;
          created_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          disqualification_reason: string | null;
          dog_id: string | null;
          entry_fee: number | null;
          entry_status: string | null;
          final_placement: number | null;
          handler: string | null;
          handler_id: string | null;
          has_video_review: boolean | null;
          id: string;
          is_in_ring: boolean | null;
          is_scored: boolean | null;
          judge_notes: string | null;
          judge_signature: string | null;
          judge_signature_timestamp: string | null;
          jump_height: string | null;
          last_synced_at: string | null;
          license_key: string | null;
          local_id: string | null;
          move_up_requested: boolean | null;
          no_finish_count: number | null;
          payment_status: string | null;
          penalty_points: number | null;
          points_earned: number | null;
          points_possible: number | null;
          preferred_judge: string | null;
          result_status: string | null;
          ring_entry_time: string | null;
          ring_exit_time: string | null;
          run_order: number | null;
          scoring_completed_at: string | null;
          scoring_started_at: string | null;
          search_time_seconds: number | null;
          show_id: string | null;
          special_requests: string | null;
          submitted_at: string | null;
          sync_version: number | null;
          time_limit_exceeded_seconds: number | null;
          time_over_limit: boolean | null;
          total_correct_finds: number | null;
          total_faults: number | null;
          total_incorrect_finds: number | null;
          total_score: number | null;
          trial_id: string | null;
          updated_at: string | null;
          video_review_notes: string | null;
        };
        Insert: {
          area1_correct?: number | null;
          area1_faults?: number | null;
          area1_incorrect?: number | null;
          area1_time_seconds?: number | null;
          area2_correct?: number | null;
          area2_faults?: number | null;
          area2_incorrect?: number | null;
          area2_time_seconds?: number | null;
          area3_correct?: number | null;
          area3_faults?: number | null;
          area3_incorrect?: number | null;
          area3_time_seconds?: number | null;
          area4_time_seconds?: number | null;
          armband?: string | null;
          bonus_points?: number | null;
          class_id?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          disqualification_reason?: string | null;
          dog_id?: string | null;
          entry_fee?: number | null;
          entry_status?: string | null;
          final_placement?: number | null;
          handler?: string | null;
          handler_id?: string | null;
          has_video_review?: boolean | null;
          id?: string;
          is_in_ring?: boolean | null;
          is_scored?: boolean | null;
          judge_notes?: string | null;
          judge_signature?: string | null;
          judge_signature_timestamp?: string | null;
          jump_height?: string | null;
          last_synced_at?: string | null;
          license_key?: string | null;
          local_id?: string | null;
          move_up_requested?: boolean | null;
          no_finish_count?: number | null;
          payment_status?: string | null;
          penalty_points?: number | null;
          points_earned?: number | null;
          points_possible?: number | null;
          preferred_judge?: string | null;
          result_status?: string | null;
          ring_entry_time?: string | null;
          ring_exit_time?: string | null;
          run_order?: number | null;
          scoring_completed_at?: string | null;
          scoring_started_at?: string | null;
          search_time_seconds?: number | null;
          show_id?: string | null;
          special_requests?: string | null;
          submitted_at?: string | null;
          sync_version?: number | null;
          time_limit_exceeded_seconds?: number | null;
          time_over_limit?: boolean | null;
          total_correct_finds?: number | null;
          total_faults?: number | null;
          total_incorrect_finds?: number | null;
          total_score?: number | null;
          trial_id?: string | null;
          updated_at?: string | null;
          video_review_notes?: string | null;
        };
        Update: {
          area1_correct?: number | null;
          area1_faults?: number | null;
          area1_incorrect?: number | null;
          area1_time_seconds?: number | null;
          area2_correct?: number | null;
          area2_faults?: number | null;
          area2_incorrect?: number | null;
          area2_time_seconds?: number | null;
          area3_correct?: number | null;
          area3_faults?: number | null;
          area3_incorrect?: number | null;
          area3_time_seconds?: number | null;
          area4_time_seconds?: number | null;
          armband?: string | null;
          bonus_points?: number | null;
          class_id?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          disqualification_reason?: string | null;
          dog_id?: string | null;
          entry_fee?: number | null;
          entry_status?: string | null;
          final_placement?: number | null;
          handler?: string | null;
          handler_id?: string | null;
          has_video_review?: boolean | null;
          id?: string;
          is_in_ring?: boolean | null;
          is_scored?: boolean | null;
          judge_notes?: string | null;
          judge_signature?: string | null;
          judge_signature_timestamp?: string | null;
          jump_height?: string | null;
          last_synced_at?: string | null;
          license_key?: string | null;
          local_id?: string | null;
          move_up_requested?: boolean | null;
          no_finish_count?: number | null;
          payment_status?: string | null;
          penalty_points?: number | null;
          points_earned?: number | null;
          points_possible?: number | null;
          preferred_judge?: string | null;
          result_status?: string | null;
          ring_entry_time?: string | null;
          ring_exit_time?: string | null;
          run_order?: number | null;
          scoring_completed_at?: string | null;
          scoring_started_at?: string | null;
          search_time_seconds?: number | null;
          show_id?: string | null;
          special_requests?: string | null;
          submitted_at?: string | null;
          sync_version?: number | null;
          time_limit_exceeded_seconds?: number | null;
          time_over_limit?: boolean | null;
          total_correct_finds?: number | null;
          total_faults?: number | null;
          total_incorrect_finds?: number | null;
          total_score?: number | null;
          trial_id?: string | null;
          updated_at?: string | null;
          video_review_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entries_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_handler_id_fkey';
            columns: ['handler_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
      entry_cart_items: {
        Row: {
          cart_id: string;
          class_id: string;
          created_at: string | null;
          dog_id: string;
          entry_fee_cents: number;
          handler_id: string | null;
          id: string;
          jump_height: string | null;
          special_requests: string | null;
        };
        Insert: {
          cart_id: string;
          class_id: string;
          created_at?: string | null;
          dog_id: string;
          entry_fee_cents: number;
          handler_id?: string | null;
          id?: string;
          jump_height?: string | null;
          special_requests?: string | null;
        };
        Update: {
          cart_id?: string;
          class_id?: string;
          created_at?: string | null;
          dog_id?: string;
          entry_fee_cents?: number;
          handler_id?: string | null;
          id?: string;
          jump_height?: string | null;
          special_requests?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entry_cart_items_cart_id_fkey';
            columns: ['cart_id'];
            isOneToOne: false;
            referencedRelation: 'entry_carts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_cart_items_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_cart_items_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_cart_items_handler_id_fkey';
            columns: ['handler_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      entry_carts: {
        Row: {
          created_at: string | null;
          exhibitor_id: string;
          expires_at: string | null;
          id: string;
          platform_fee_cents: number | null;
          show_id: string;
          status: string | null;
          stripe_checkout_session_id: string | null;
          subtotal_cents: number | null;
          total_cents: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          exhibitor_id: string;
          expires_at?: string | null;
          id?: string;
          platform_fee_cents?: number | null;
          show_id: string;
          status?: string | null;
          stripe_checkout_session_id?: string | null;
          subtotal_cents?: number | null;
          total_cents?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          exhibitor_id?: string;
          expires_at?: string | null;
          id?: string;
          platform_fee_cents?: number | null;
          show_id?: string;
          status?: string | null;
          stripe_checkout_session_id?: string | null;
          subtotal_cents?: number | null;
          total_cents?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entry_carts_exhibitor_id_fkey';
            columns: ['exhibitor_id'];
            isOneToOne: false;
            referencedRelation: 'exhibitor_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_carts_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
        ];
      };
      entry_status_history: {
        Row: {
          changed_at: string | null;
          changed_by: string | null;
          entry_id: string;
          id: string;
          new_status: string;
          previous_status: string | null;
          reason: string | null;
        };
        Insert: {
          changed_at?: string | null;
          changed_by?: string | null;
          entry_id: string;
          id?: string;
          new_status: string;
          previous_status?: string | null;
          reason?: string | null;
        };
        Update: {
          changed_at?: string | null;
          changed_by?: string | null;
          entry_id?: string;
          id?: string;
          new_status?: string;
          previous_status?: string | null;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entry_status_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_status_history_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entry_status_history_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'view_entry_with_results';
            referencedColumns: ['id'];
          },
        ];
      };
      exhibitor_profiles: {
        Row: {
          auth_user_id: string;
          created_at: string | null;
          default_handler_id: string | null;
          id: string;
          person_id: string;
          stripe_customer_id: string | null;
          subscription_expires_at: string | null;
          subscription_tier: string | null;
          updated_at: string | null;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string | null;
          default_handler_id?: string | null;
          id?: string;
          person_id: string;
          stripe_customer_id?: string | null;
          subscription_expires_at?: string | null;
          subscription_tier?: string | null;
          updated_at?: string | null;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string | null;
          default_handler_id?: string | null;
          id?: string;
          person_id?: string;
          stripe_customer_id?: string | null;
          subscription_expires_at?: string | null;
          subscription_tier?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exhibitor_profiles_default_handler_id_fkey';
            columns: ['default_handler_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exhibitor_profiles_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      fcm_tokens: {
        Row: {
          auth_user_id: string | null;
          created_at: string | null;
          device_name: string | null;
          device_type: string | null;
          id: string;
          is_active: boolean | null;
          last_used_at: string | null;
          token: string;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          created_at?: string | null;
          device_name?: string | null;
          device_type?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_used_at?: string | null;
          token: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          created_at?: string | null;
          device_name?: string | null;
          device_type?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_used_at?: string | null;
          token?: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fcm_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      health_records: {
        Row: {
          attachments: string[] | null;
          created_at: string | null;
          date: string;
          description: string | null;
          dog_id: string;
          id: string;
          record_type: string;
          title: string;
          updated_at: string | null;
          vet_clinic: string | null;
          vet_name: string | null;
        };
        Insert: {
          attachments?: string[] | null;
          created_at?: string | null;
          date: string;
          description?: string | null;
          dog_id: string;
          id?: string;
          record_type: string;
          title: string;
          updated_at?: string | null;
          vet_clinic?: string | null;
          vet_name?: string | null;
        };
        Update: {
          attachments?: string[] | null;
          created_at?: string | null;
          date?: string;
          description?: string | null;
          dog_id?: string;
          id?: string;
          record_type?: string;
          title?: string;
          updated_at?: string | null;
          vet_clinic?: string | null;
          vet_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'health_records_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      judge_assignments: {
        Row: {
          class_id: string | null;
          confirmed_at: string | null;
          created_at: string | null;
          fee: number | null;
          id: string;
          invited_at: string | null;
          notes: string | null;
          person_id: string;
          show_id: string | null;
          status: string | null;
          trial_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          class_id?: string | null;
          confirmed_at?: string | null;
          created_at?: string | null;
          fee?: number | null;
          id?: string;
          invited_at?: string | null;
          notes?: string | null;
          person_id: string;
          show_id?: string | null;
          status?: string | null;
          trial_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          class_id?: string | null;
          confirmed_at?: string | null;
          created_at?: string | null;
          fee?: number | null;
          id?: string;
          invited_at?: string | null;
          notes?: string | null;
          person_id?: string;
          show_id?: string | null;
          status?: string | null;
          trial_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'judge_assignments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'judge_assignments_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'judge_assignments_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'judge_assignments_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
      judge_certifications: {
        Row: {
          certification_date: string | null;
          certification_number: string | null;
          created_at: string | null;
          expiration_date: string | null;
          id: string;
          is_active: boolean | null;
          level: string | null;
          organization: string;
          person_id: string;
          sport: string;
          updated_at: string | null;
        };
        Insert: {
          certification_date?: string | null;
          certification_number?: string | null;
          created_at?: string | null;
          expiration_date?: string | null;
          id?: string;
          is_active?: boolean | null;
          level?: string | null;
          organization: string;
          person_id: string;
          sport: string;
          updated_at?: string | null;
        };
        Update: {
          certification_date?: string | null;
          certification_number?: string | null;
          created_at?: string | null;
          expiration_date?: string | null;
          id?: string;
          is_active?: boolean | null;
          level?: string | null;
          organization?: string;
          person_id?: string;
          sport?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'judge_certifications_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      medications: {
        Row: {
          created_at: string | null;
          dog_id: string;
          dosage: string | null;
          end_date: string | null;
          frequency: string | null;
          id: string;
          is_active: boolean | null;
          medication_name: string;
          prescribing_vet: string | null;
          reason: string | null;
          start_date: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          dog_id: string;
          dosage?: string | null;
          end_date?: string | null;
          frequency?: string | null;
          id?: string;
          is_active?: boolean | null;
          medication_name: string;
          prescribing_vet?: string | null;
          reason?: string | null;
          start_date?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          dog_id?: string;
          dosage?: string | null;
          end_date?: string | null;
          frequency?: string | null;
          id?: string;
          is_active?: boolean | null;
          medication_name?: string;
          prescribing_vet?: string | null;
          reason?: string | null;
          start_date?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'medications_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      nationals_advancement: {
        Row: {
          advanced: boolean | null;
          advancement_rank: number | null;
          created_at: string | null;
          entry_id: string;
          from_day: number;
          id: string;
          license_key: string | null;
          to_day: number;
        };
        Insert: {
          advanced?: boolean | null;
          advancement_rank?: number | null;
          created_at?: string | null;
          entry_id: string;
          from_day: number;
          id?: string;
          license_key?: string | null;
          to_day: number;
        };
        Update: {
          advanced?: boolean | null;
          advancement_rank?: number | null;
          created_at?: string | null;
          entry_id?: string;
          from_day?: number;
          id?: string;
          license_key?: string | null;
          to_day?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'nationals_advancement_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nationals_advancement_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'view_entry_with_results';
            referencedColumns: ['id'];
          },
        ];
      };
      nationals_rankings: {
        Row: {
          created_at: string | null;
          current_rank: number | null;
          elements_completed: number | null;
          elimination_reason: string | null;
          entry_id: string;
          id: string;
          is_eliminated: boolean | null;
          license_key: string | null;
          previous_rank: number | null;
          total_points: number | null;
          total_time_seconds: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          current_rank?: number | null;
          elements_completed?: number | null;
          elimination_reason?: string | null;
          entry_id: string;
          id?: string;
          is_eliminated?: boolean | null;
          license_key?: string | null;
          previous_rank?: number | null;
          total_points?: number | null;
          total_time_seconds?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          current_rank?: number | null;
          elements_completed?: number | null;
          elimination_reason?: string | null;
          entry_id?: string;
          id?: string;
          is_eliminated?: boolean | null;
          license_key?: string | null;
          previous_rank?: number | null;
          total_points?: number | null;
          total_time_seconds?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'nationals_rankings_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: true;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nationals_rankings_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: true;
            referencedRelation: 'view_entry_with_results';
            referencedColumns: ['id'];
          },
        ];
      };
      nationals_scores: {
        Row: {
          competition_day: number;
          correct_finds: number | null;
          created_at: string | null;
          element_type: string;
          entry_id: string;
          faults: number | null;
          id: string;
          incorrect_finds: number | null;
          is_scored: boolean | null;
          license_key: string | null;
          no_finish_count: number | null;
          points: number | null;
          result_status: string | null;
          time_seconds: number | null;
          updated_at: string | null;
        };
        Insert: {
          competition_day: number;
          correct_finds?: number | null;
          created_at?: string | null;
          element_type: string;
          entry_id: string;
          faults?: number | null;
          id?: string;
          incorrect_finds?: number | null;
          is_scored?: boolean | null;
          license_key?: string | null;
          no_finish_count?: number | null;
          points?: number | null;
          result_status?: string | null;
          time_seconds?: number | null;
          updated_at?: string | null;
        };
        Update: {
          competition_day?: number;
          correct_finds?: number | null;
          created_at?: string | null;
          element_type?: string;
          entry_id?: string;
          faults?: number | null;
          id?: string;
          incorrect_finds?: number | null;
          is_scored?: boolean | null;
          license_key?: string | null;
          no_finish_count?: number | null;
          points?: number | null;
          result_status?: string | null;
          time_seconds?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'nationals_scores_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nationals_scores_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'view_entry_with_results';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          auth_user_id: string | null;
          created_at: string | null;
          email_enabled: boolean | null;
          entry_confirmations: boolean | null;
          id: string;
          payment_receipts: boolean | null;
          promotional: boolean | null;
          push_enabled: boolean | null;
          results_available: boolean | null;
          schedule_changes: boolean | null;
          sms_enabled: boolean | null;
          upcoming_runs: boolean | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          created_at?: string | null;
          email_enabled?: boolean | null;
          entry_confirmations?: boolean | null;
          id?: string;
          payment_receipts?: boolean | null;
          promotional?: boolean | null;
          push_enabled?: boolean | null;
          results_available?: boolean | null;
          schedule_changes?: boolean | null;
          sms_enabled?: boolean | null;
          upcoming_runs?: boolean | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          created_at?: string | null;
          email_enabled?: boolean | null;
          entry_confirmations?: boolean | null;
          id?: string;
          payment_receipts?: boolean | null;
          promotional?: boolean | null;
          push_enabled?: boolean | null;
          results_available?: boolean | null;
          schedule_changes?: boolean | null;
          sms_enabled?: boolean | null;
          upcoming_runs?: boolean | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_queue: {
        Row: {
          body: string | null;
          channels: string[] | null;
          created_at: string | null;
          data: Json | null;
          error_message: string | null;
          id: string;
          notification_type: string;
          scheduled_for: string | null;
          sent_at: string | null;
          status: string | null;
          title: string;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          channels?: string[] | null;
          created_at?: string | null;
          data?: Json | null;
          error_message?: string | null;
          id?: string;
          notification_type: string;
          scheduled_for?: string | null;
          sent_at?: string | null;
          status?: string | null;
          title: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          channels?: string[] | null;
          created_at?: string | null;
          data?: Json | null;
          error_message?: string | null;
          id?: string;
          notification_type?: string;
          scheduled_for?: string | null;
          sent_at?: string | null;
          status?: string | null;
          title?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_queue_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      offline_scoring: {
        Row: {
          client_id: string;
          conflict_detected: boolean | null;
          entry_id: string;
          id: string;
          resolution: string | null;
          scoring_data: Json;
          submitted_at: string | null;
          synced: boolean | null;
          synced_at: string | null;
        };
        Insert: {
          client_id: string;
          conflict_detected?: boolean | null;
          entry_id: string;
          id?: string;
          resolution?: string | null;
          scoring_data: Json;
          submitted_at?: string | null;
          synced?: boolean | null;
          synced_at?: string | null;
        };
        Update: {
          client_id?: string;
          conflict_detected?: boolean | null;
          entry_id?: string;
          id?: string;
          resolution?: string | null;
          scoring_data?: Json;
          submitted_at?: string | null;
          synced?: boolean | null;
          synced_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'offline_scoring_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offline_scoring_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'view_entry_with_results';
            referencedColumns: ['id'];
          },
        ];
      };
      people: {
        Row: {
          auth_user_id: string | null;
          bio: string | null;
          city: string | null;
          country: string | null;
          created_at: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          license_key: string | null;
          phone: string | null;
          profile_image: string | null;
          roles: string[] | null;
          state: string | null;
          street_address: string | null;
          updated_at: string | null;
          zip_code: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          bio?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          license_key?: string | null;
          phone?: string | null;
          profile_image?: string | null;
          roles?: string[] | null;
          state?: string | null;
          street_address?: string | null;
          updated_at?: string | null;
          zip_code?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          bio?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          license_key?: string | null;
          phone?: string | null;
          profile_image?: string | null;
          roles?: string[] | null;
          state?: string | null;
          street_address?: string | null;
          updated_at?: string | null;
          zip_code?: string | null;
        };
        Relationships: [];
      };
      performance_metrics: {
        Row: {
          created_at: string | null;
          id: string;
          license_key: string | null;
          metadata: Json | null;
          metric_name: string;
          metric_type: string;
          metric_value: number | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          license_key?: string | null;
          metadata?: Json | null;
          metric_name: string;
          metric_type: string;
          metric_value?: number | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          license_key?: string | null;
          metadata?: Json | null;
          metric_name?: string;
          metric_type?: string;
          metric_value?: number | null;
        };
        Relationships: [];
      };
      permission_audit_log: {
        Row: {
          action: string;
          created_at: string | null;
          id: string;
          ip_address: string | null;
          new_value: Json | null;
          old_value: Json | null;
          target_id: string | null;
          target_type: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          id?: string;
          ip_address?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          target_id?: string | null;
          target_type?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          id?: string;
          ip_address?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          target_id?: string | null;
          target_type?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'permission_audit_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          category: string | null;
          code: string;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
        };
        Insert: {
          category?: string | null;
          code: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          category?: string | null;
          code?: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      push_notification_queue: {
        Row: {
          attempts: number | null;
          body: string | null;
          created_at: string | null;
          data: Json | null;
          error_message: string | null;
          id: string;
          max_attempts: number | null;
          priority: string | null;
          scheduled_for: string | null;
          sent_at: string | null;
          status: string | null;
          subscription_id: string | null;
          title: string;
        };
        Insert: {
          attempts?: number | null;
          body?: string | null;
          created_at?: string | null;
          data?: Json | null;
          error_message?: string | null;
          id?: string;
          max_attempts?: number | null;
          priority?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          status?: string | null;
          subscription_id?: string | null;
          title: string;
        };
        Update: {
          attempts?: number | null;
          body?: string | null;
          created_at?: string | null;
          data?: Json | null;
          error_message?: string | null;
          id?: string;
          max_attempts?: number | null;
          priority?: string | null;
          scheduled_for?: string | null;
          sent_at?: string | null;
          status?: string | null;
          subscription_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_notification_queue_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'push_subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string | null;
          created_at: string | null;
          endpoint: string;
          id: string;
          license_key: string | null;
          p256dh: string | null;
          user_id: string | null;
        };
        Insert: {
          auth?: string | null;
          created_at?: string | null;
          endpoint: string;
          id?: string;
          license_key?: string | null;
          p256dh?: string | null;
          user_id?: string | null;
        };
        Update: {
          auth?: string | null;
          created_at?: string | null;
          endpoint?: string;
          id?: string;
          license_key?: string | null;
          p256dh?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          created_at: string | null;
          id: string;
          permission_id: string;
          role_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_id_fkey';
            columns: ['permission_id'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_permissions_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          is_system: boolean | null;
          name: string;
          permissions: string[] | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_system?: boolean | null;
          name: string;
          permissions?: string[] | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_system?: boolean | null;
          name?: string;
          permissions?: string[] | null;
        };
        Relationships: [];
      };
      rule_organizations: {
        Row: {
          code: string;
          created_at: string | null;
          id: string;
          name: string;
          website: string | null;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          id?: string;
          name: string;
          website?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          id?: string;
          name?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      rule_sports: {
        Row: {
          code: string;
          created_at: string | null;
          id: string;
          name: string;
          organization_id: string | null;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          id?: string;
          name: string;
          organization_id?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          id?: string;
          name?: string;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_sports_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'rule_organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      rulebooks: {
        Row: {
          created_at: string | null;
          effective_date: string | null;
          id: string;
          organization_id: string | null;
          source_url: string | null;
          sport_id: string | null;
          title: string;
          version: string | null;
        };
        Insert: {
          created_at?: string | null;
          effective_date?: string | null;
          id?: string;
          organization_id?: string | null;
          source_url?: string | null;
          sport_id?: string | null;
          title: string;
          version?: string | null;
        };
        Update: {
          created_at?: string | null;
          effective_date?: string | null;
          id?: string;
          organization_id?: string | null;
          source_url?: string | null;
          sport_id?: string | null;
          title?: string;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rulebooks_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'rule_organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rulebooks_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'rule_sports';
            referencedColumns: ['id'];
          },
        ];
      };
      rules: {
        Row: {
          content: string;
          created_at: string | null;
          embedding: string | null;
          id: string;
          keywords: string[] | null;
          rule_number: string | null;
          rulebook_id: string | null;
          section: string | null;
          title: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          embedding?: string | null;
          id?: string;
          keywords?: string[] | null;
          rule_number?: string | null;
          rulebook_id?: string | null;
          section?: string | null;
          title?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          embedding?: string | null;
          id?: string;
          keywords?: string[] | null;
          rule_number?: string | null;
          rulebook_id?: string | null;
          section?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rules_rulebook_id_fkey';
            columns: ['rulebook_id'];
            isOneToOne: false;
            referencedRelation: 'rulebooks';
            referencedColumns: ['id'];
          },
        ];
      };
      rules_feedback: {
        Row: {
          created_at: string | null;
          feedback_text: string | null;
          helpful: boolean | null;
          id: string;
          query_log_id: string | null;
          rule_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          feedback_text?: string | null;
          helpful?: boolean | null;
          id?: string;
          query_log_id?: string | null;
          rule_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          feedback_text?: string | null;
          helpful?: boolean | null;
          id?: string;
          query_log_id?: string | null;
          rule_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rules_feedback_query_log_id_fkey';
            columns: ['query_log_id'];
            isOneToOne: false;
            referencedRelation: 'rules_query_log';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rules_feedback_rule_id_fkey';
            columns: ['rule_id'];
            isOneToOne: false;
            referencedRelation: 'rules';
            referencedColumns: ['id'];
          },
        ];
      };
      rules_query_log: {
        Row: {
          created_at: string | null;
          id: string;
          license_key: string | null;
          query: string;
          response_time_ms: number | null;
          results_count: number | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          license_key?: string | null;
          query: string;
          response_time_ms?: number | null;
          results_count?: number | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          license_key?: string | null;
          query?: string;
          response_time_ms?: number | null;
          results_count?: number | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      show_result_visibility_defaults: {
        Row: {
          auto_release_delay_minutes: number | null;
          created_at: string | null;
          default_visibility: string | null;
          id: string;
          show_id: string;
        };
        Insert: {
          auto_release_delay_minutes?: number | null;
          created_at?: string | null;
          default_visibility?: string | null;
          id?: string;
          show_id: string;
        };
        Update: {
          auto_release_delay_minutes?: number | null;
          created_at?: string | null;
          default_visibility?: string | null;
          id?: string;
          show_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'show_result_visibility_defaults_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: true;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
        ];
      };
      show_templates: {
        Row: {
          club_id: string | null;
          created_at: string | null;
          created_by: string | null;
          default_day_of_show_fee: number | null;
          default_entry_period_days: number | null;
          default_max_entries_per_dog: number | null;
          default_pre_entry_fee: number | null;
          description: string | null;
          id: string;
          is_public: boolean | null;
          name: string;
          show_type: string;
          template_data: Json | null;
          updated_at: string | null;
        };
        Insert: {
          club_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          default_day_of_show_fee?: number | null;
          default_entry_period_days?: number | null;
          default_max_entries_per_dog?: number | null;
          default_pre_entry_fee?: number | null;
          description?: string | null;
          id?: string;
          is_public?: boolean | null;
          name: string;
          show_type: string;
          template_data?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          club_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          default_day_of_show_fee?: number | null;
          default_entry_period_days?: number | null;
          default_max_entries_per_dog?: number | null;
          default_pre_entry_fee?: number | null;
          description?: string | null;
          id?: string;
          is_public?: boolean | null;
          name?: string;
          show_type?: string;
          template_data?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'show_templates_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'show_templates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      shows: {
        Row: {
          address: string | null;
          allow_non_owner_handlers: boolean | null;
          chairman: string | null;
          chief_steward: string | null;
          city: string | null;
          club_id: string | null;
          created_at: string | null;
          day_of_show_fee: number | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          end_date: string;
          entry_close_date: string | null;
          entry_open_date: string | null;
          id: string;
          license_key: string | null;
          location: string | null;
          max_entries_per_dog: number | null;
          max_total_entries: number | null;
          name: string;
          pre_entry_fee: number | null;
          results_released_at: string | null;
          results_visible_to_all: boolean | null;
          secretary: string | null;
          start_date: string;
          state: string | null;
          status: string | null;
          organization: string;
          updated_at: string | null;
          venue_name: string | null;
          zip_code: string | null;
        };
        Insert: {
          address?: string | null;
          allow_non_owner_handlers?: boolean | null;
          chairman?: string | null;
          chief_steward?: string | null;
          city?: string | null;
          club_id?: string | null;
          created_at?: string | null;
          day_of_show_fee?: number | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          end_date: string;
          entry_close_date?: string | null;
          entry_open_date?: string | null;
          id?: string;
          license_key?: string | null;
          location?: string | null;
          max_entries_per_dog?: number | null;
          max_total_entries?: number | null;
          name: string;
          pre_entry_fee?: number | null;
          results_released_at?: string | null;
          results_visible_to_all?: boolean | null;
          secretary?: string | null;
          start_date: string;
          state?: string | null;
          status?: string | null;
          organization: string;
          updated_at?: string | null;
          venue_name?: string | null;
          zip_code?: string | null;
        };
        Update: {
          address?: string | null;
          allow_non_owner_handlers?: boolean | null;
          chairman?: string | null;
          chief_steward?: string | null;
          city?: string | null;
          club_id?: string | null;
          created_at?: string | null;
          day_of_show_fee?: number | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          end_date?: string;
          entry_close_date?: string | null;
          entry_open_date?: string | null;
          id?: string;
          license_key?: string | null;
          location?: string | null;
          max_entries_per_dog?: number | null;
          max_total_entries?: number | null;
          name?: string;
          pre_entry_fee?: number | null;
          results_released_at?: string | null;
          results_visible_to_all?: boolean | null;
          secretary?: string | null;
          start_date?: string;
          state?: string | null;
          status?: string | null;
          organization?: string;
          updated_at?: string | null;
          venue_name?: string | null;
          zip_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'shows_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_customers: {
        Row: {
          created_at: string | null;
          email: string | null;
          id: string;
          person_id: string;
          stripe_customer_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          person_id: string;
          stripe_customer_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          person_id?: string;
          stripe_customer_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_customers_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_orders: {
        Row: {
          amount_cents: number;
          created_at: string | null;
          currency: string | null;
          customer_id: string | null;
          entry_ids: string[] | null;
          id: string;
          metadata: Json | null;
          order_type: string | null;
          paid_at: string | null;
          refunded_at: string | null;
          show_id: string | null;
          status: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          amount_cents: number;
          created_at?: string | null;
          currency?: string | null;
          customer_id?: string | null;
          entry_ids?: string[] | null;
          id?: string;
          metadata?: Json | null;
          order_type?: string | null;
          paid_at?: string | null;
          refunded_at?: string | null;
          show_id?: string | null;
          status?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          amount_cents?: number;
          created_at?: string | null;
          currency?: string | null;
          customer_id?: string | null;
          entry_ids?: string[] | null;
          id?: string;
          metadata?: Json | null;
          order_type?: string | null;
          paid_at?: string | null;
          refunded_at?: string | null;
          show_id?: string | null;
          status?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'stripe_customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stripe_orders_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null;
          cancelled_at: string | null;
          created_at: string | null;
          current_period_end: string | null;
          current_period_start: string | null;
          customer_id: string | null;
          id: string;
          status: string | null;
          stripe_price_id: string | null;
          stripe_subscription_id: string;
          updated_at: string | null;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          cancelled_at?: string | null;
          created_at?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          customer_id?: string | null;
          id?: string;
          status?: string | null;
          stripe_price_id?: string | null;
          stripe_subscription_id: string;
          updated_at?: string | null;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          cancelled_at?: string | null;
          created_at?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          customer_id?: string | null;
          id?: string;
          status?: string | null;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_subscriptions_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'stripe_customers';
            referencedColumns: ['id'];
          },
        ];
      };
      sync_conflicts: {
        Row: {
          client_data: Json | null;
          created_at: string | null;
          id: string;
          record_id: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          server_data: Json | null;
          table_name: string;
        };
        Insert: {
          client_data?: Json | null;
          created_at?: string | null;
          id?: string;
          record_id: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          server_data?: Json | null;
          table_name: string;
        };
        Update: {
          client_data?: Json | null;
          created_at?: string | null;
          id?: string;
          record_id?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          server_data?: Json | null;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sync_conflicts_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      template_fields: {
        Row: {
          created_at: string | null;
          default_value: string | null;
          field_label: string | null;
          field_name: string;
          field_type: string;
          id: string;
          is_required: boolean | null;
          sort_order: number | null;
          template_id: string;
          template_type: string;
          validation_rules: Json | null;
        };
        Insert: {
          created_at?: string | null;
          default_value?: string | null;
          field_label?: string | null;
          field_name: string;
          field_type: string;
          id?: string;
          is_required?: boolean | null;
          sort_order?: number | null;
          template_id: string;
          template_type: string;
          validation_rules?: Json | null;
        };
        Update: {
          created_at?: string | null;
          default_value?: string | null;
          field_label?: string | null;
          field_name?: string;
          field_type?: string;
          id?: string;
          is_required?: boolean | null;
          sort_order?: number | null;
          template_id?: string;
          template_type?: string;
          validation_rules?: Json | null;
        };
        Relationships: [];
      };
      trial_result_visibility_overrides: {
        Row: {
          created_at: string | null;
          id: string;
          release_at: string | null;
          trial_id: string;
          visibility: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          release_at?: string | null;
          trial_id: string;
          visibility?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          release_at?: string | null;
          trial_id?: string;
          visibility?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trial_result_visibility_overrides_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: true;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
      trials: {
        Row: {
          actual_end_time: string | null;
          actual_start_time: string | null;
          allow_self_checkin: boolean | null;
          created_at: string | null;
          date: string;
          deleted_at: string | null;
          deleted_by: string | null;
          id: string;
          max_entries_per_dog: number | null;
          max_entries_per_handler: number | null;
          max_total_entries: number | null;
          name: string;
          planned_start_time: string | null;
          show_id: string;
          status: string | null;
          trial_number: string | null;
          updated_at: string | null;
        };
        Insert: {
          actual_end_time?: string | null;
          actual_start_time?: string | null;
          allow_self_checkin?: boolean | null;
          created_at?: string | null;
          date: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          max_entries_per_dog?: number | null;
          max_entries_per_handler?: number | null;
          max_total_entries?: number | null;
          name: string;
          planned_start_time?: string | null;
          show_id: string;
          status?: string | null;
          trial_number?: string | null;
          updated_at?: string | null;
        };
        Update: {
          actual_end_time?: string | null;
          actual_start_time?: string | null;
          allow_self_checkin?: boolean | null;
          created_at?: string | null;
          date?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          max_entries_per_dog?: number | null;
          max_entries_per_handler?: number | null;
          max_total_entries?: number | null;
          name?: string;
          planned_start_time?: string | null;
          show_id?: string;
          status?: string | null;
          trial_number?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trials_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          app: string;
          auth_user_id: string | null;
          created_at: string | null;
          id: string;
          license_key: string | null;
          preferences: Json | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          app: string;
          auth_user_id?: string | null;
          created_at?: string | null;
          id?: string;
          license_key?: string | null;
          preferences?: Json | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          app?: string;
          auth_user_id?: string | null;
          created_at?: string | null;
          id?: string;
          license_key?: string | null;
          preferences?: Json | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          club_id: string | null;
          expires_at: string | null;
          granted_at: string | null;
          granted_by: string | null;
          id: string;
          role_id: string;
          show_id: string | null;
          user_id: string;
        };
        Insert: {
          club_id?: string | null;
          expires_at?: string | null;
          granted_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role_id: string;
          show_id?: string | null;
          user_id: string;
        };
        Update: {
          club_id?: string | null;
          expires_at?: string | null;
          granted_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role_id?: string;
          show_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      vaccinations: {
        Row: {
          administered_by: string | null;
          created_at: string | null;
          date_administered: string;
          dog_id: string;
          expiration_date: string | null;
          id: string;
          lot_number: string | null;
          notes: string | null;
          updated_at: string | null;
          vaccine_name: string;
        };
        Insert: {
          administered_by?: string | null;
          created_at?: string | null;
          date_administered: string;
          dog_id: string;
          expiration_date?: string | null;
          id?: string;
          lot_number?: string | null;
          notes?: string | null;
          updated_at?: string | null;
          vaccine_name: string;
        };
        Update: {
          administered_by?: string | null;
          created_at?: string | null;
          date_administered?: string;
          dog_id?: string;
          expiration_date?: string | null;
          id?: string;
          lot_number?: string | null;
          notes?: string | null;
          updated_at?: string | null;
          vaccine_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vaccinations_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      vet_visits: {
        Row: {
          clinic_name: string | null;
          cost: number | null;
          created_at: string | null;
          diagnosis: string | null;
          dog_id: string;
          follow_up_date: string | null;
          id: string;
          notes: string | null;
          reason: string;
          treatment: string | null;
          updated_at: string | null;
          vet_name: string | null;
          visit_date: string;
        };
        Insert: {
          clinic_name?: string | null;
          cost?: number | null;
          created_at?: string | null;
          diagnosis?: string | null;
          dog_id: string;
          follow_up_date?: string | null;
          id?: string;
          notes?: string | null;
          reason: string;
          treatment?: string | null;
          updated_at?: string | null;
          vet_name?: string | null;
          visit_date: string;
        };
        Update: {
          clinic_name?: string | null;
          cost?: number | null;
          created_at?: string | null;
          diagnosis?: string | null;
          dog_id?: string;
          follow_up_date?: string | null;
          id?: string;
          notes?: string | null;
          reason?: string;
          treatment?: string | null;
          updated_at?: string | null;
          vet_name?: string | null;
          visit_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vet_visits_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
        ];
      };
      volunteer_class_assignments: {
        Row: {
          class_id: string;
          created_at: string | null;
          id: string;
          notes: string | null;
          role_id: string | null;
          role_name: string | null;
          status: string | null;
          volunteer_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          role_id?: string | null;
          role_name?: string | null;
          status?: string | null;
          volunteer_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          role_id?: string | null;
          role_name?: string | null;
          status?: string | null;
          volunteer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'volunteer_class_assignments_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'volunteer_class_assignments_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'volunteer_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'volunteer_class_assignments_volunteer_id_fkey';
            columns: ['volunteer_id'];
            isOneToOne: false;
            referencedRelation: 'volunteers';
            referencedColumns: ['id'];
          },
        ];
      };
      volunteer_general_assignments: {
        Row: {
          created_at: string | null;
          id: string;
          notes: string | null;
          role_id: string | null;
          role_name: string | null;
          shift_end: string | null;
          shift_start: string | null;
          show_id: string | null;
          status: string | null;
          trial_id: string | null;
          volunteer_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          role_id?: string | null;
          role_name?: string | null;
          shift_end?: string | null;
          shift_start?: string | null;
          show_id?: string | null;
          status?: string | null;
          trial_id?: string | null;
          volunteer_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          notes?: string | null;
          role_id?: string | null;
          role_name?: string | null;
          shift_end?: string | null;
          shift_start?: string | null;
          show_id?: string | null;
          status?: string | null;
          trial_id?: string | null;
          volunteer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'volunteer_general_assignments_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'volunteer_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'volunteer_general_assignments_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'volunteer_general_assignments_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'volunteer_general_assignments_volunteer_id_fkey';
            columns: ['volunteer_id'];
            isOneToOne: false;
            referencedRelation: 'volunteers';
            referencedColumns: ['id'];
          },
        ];
      };
      volunteer_roles: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          license_key: string | null;
          max_volunteers: number | null;
          name: string;
          requires_training: boolean | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          license_key?: string | null;
          max_volunteers?: number | null;
          name: string;
          requires_training?: boolean | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          license_key?: string | null;
          max_volunteers?: number | null;
          name?: string;
          requires_training?: boolean | null;
        };
        Relationships: [];
      };
      volunteers: {
        Row: {
          created_at: string | null;
          email: string | null;
          id: string;
          is_available: boolean | null;
          license_key: string | null;
          name: string;
          notes: string | null;
          person_id: string | null;
          phone: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          is_available?: boolean | null;
          license_key?: string | null;
          name: string;
          notes?: string | null;
          person_id?: string | null;
          phone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string | null;
          id?: string;
          is_available?: boolean | null;
          license_key?: string | null;
          name?: string;
          notes?: string | null;
          person_id?: string | null;
          phone?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'volunteers_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      waitlist_entries: {
        Row: {
          class_id: string;
          created_at: string | null;
          dog_id: string;
          exhibitor_id: string;
          handler_id: string | null;
          id: string;
          offer_expires_at: string | null;
          offered_at: string | null;
          position: number;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          class_id: string;
          created_at?: string | null;
          dog_id: string;
          exhibitor_id: string;
          handler_id?: string | null;
          id?: string;
          offer_expires_at?: string | null;
          offered_at?: string | null;
          position: number;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          class_id?: string;
          created_at?: string | null;
          dog_id?: string;
          exhibitor_id?: string;
          handler_id?: string | null;
          id?: string;
          offer_expires_at?: string | null;
          offered_at?: string | null;
          position?: number;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'waitlist_entries_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waitlist_entries_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waitlist_entries_exhibitor_id_fkey';
            columns: ['exhibitor_id'];
            isOneToOne: false;
            referencedRelation: 'exhibitor_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waitlist_entries_handler_id_fkey';
            columns: ['handler_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      view_entry_with_results: {
        Row: {
          area1_correct: number | null;
          area1_faults: number | null;
          area1_incorrect: number | null;
          area1_time_seconds: number | null;
          area2_correct: number | null;
          area2_faults: number | null;
          area2_incorrect: number | null;
          area2_time_seconds: number | null;
          area3_correct: number | null;
          area3_faults: number | null;
          area3_incorrect: number | null;
          area3_time_seconds: number | null;
          area4_time_seconds: number | null;
          armband: string | null;
          bonus_points: number | null;
          class_element: string | null;
          class_id: string | null;
          class_level: string | null;
          class_name: string | null;
          created_at: string | null;
          disqualification_reason: string | null;
          dog_breed: string | null;
          dog_call_name: string | null;
          dog_id: string | null;
          dog_name: string | null;
          entry_fee: number | null;
          entry_status: string | null;
          final_placement: number | null;
          handler: string | null;
          handler_id: string | null;
          has_video_review: boolean | null;
          id: string | null;
          is_in_ring: boolean | null;
          is_scored: boolean | null;
          judge_notes: string | null;
          judge_signature: string | null;
          judge_signature_timestamp: string | null;
          jump_height: string | null;
          last_synced_at: string | null;
          license_key: string | null;
          local_id: string | null;
          move_up_requested: boolean | null;
          no_finish_count: number | null;
          payment_status: string | null;
          penalty_points: number | null;
          points_earned: number | null;
          points_possible: number | null;
          preferred_judge: string | null;
          result_status: string | null;
          result_text: string | null;
          ring_entry_time: string | null;
          ring_exit_time: string | null;
          run_order: number | null;
          scoring_completed_at: string | null;
          scoring_started_at: string | null;
          search_time_seconds: number | null;
          show_id: string | null;
          special_requests: string | null;
          submitted_at: string | null;
          sync_version: number | null;
          time_limit_exceeded_seconds: number | null;
          time_over_limit: boolean | null;
          total_correct_finds: number | null;
          total_faults: number | null;
          total_incorrect_finds: number | null;
          total_score: number | null;
          trial_id: string | null;
          updated_at: string | null;
          video_review_notes: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'entries_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_dog_id_fkey';
            columns: ['dog_id'];
            isOneToOne: false;
            referencedRelation: 'dogs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_handler_id_fkey';
            columns: ['handler_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_show_id_fkey';
            columns: ['show_id'];
            isOneToOne: false;
            referencedRelation: 'shows';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entries_trial_id_fkey';
            columns: ['trial_id'];
            isOneToOne: false;
            referencedRelation: 'trials';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      add_to_waitlist: {
        Args: {
          p_class_id: string;
          p_dog_id: string;
          p_exhibitor_id: string;
          p_handler_id?: string;
        };
        Returns: {
          class_id: string;
          created_at: string | null;
          dog_id: string;
          exhibitor_id: string;
          handler_id: string | null;
          id: string;
          offer_expires_at: string | null;
          offered_at: string | null;
          position: number;
          status: string | null;
          updated_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'waitlist_entries';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      check_class_availability: {
        Args: { p_class_id: string };
        Returns: {
          available_spots: number;
          confirmed_count: number;
          entry_limit: number;
          is_available: boolean;
          waitlist_position: number;
        }[];
      };
      get_license_key: { Args: never; Returns: string };
      has_role: {
        Args: { role_name: string; scope_club_id?: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
