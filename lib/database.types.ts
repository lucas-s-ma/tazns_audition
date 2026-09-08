import type { Candidate, Cycle, Evaluation, User } from './domain';
type Table<Row> = {
  Row: { [K in keyof Row]: Row[K] };
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
export interface Database {
  public: {
    Tables: {
      users: Table<User>;
      audition_cycles: Table<Cycle>;
      candidates: Table<Candidate>;
      evaluations: Table<Evaluation>;
      team_deliberations: Table<Evaluation & { updated_by_user_id: string | null }>;
      sessions: Table<{
        token_hash: string;
        user_id: string;
        expires_at: string;
        unlocked_until: string | null;
        unlock_attempts: number;
        unlock_window_at: string;
      }>;
      change_signal: Table<{ id: number; revision: number }>;
      audit_events: Table<{
        id: string;
        audition_cycle_id: string | null;
        candidate_id: string | null;
        user_id: string | null;
        event_type: string;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      mutate: {
        Args: { actor_id: string; operation: string; payload: Record<string, unknown> };
        Returns: unknown;
      };
      toggle_deliberation: {
        Args: { actor_id: string; cycle_id: string; active: boolean };
        Returns: unknown;
      };
      login_identity: { Args: { normalized_name: string }; Returns: User };
      consume_unlock_attempt: { Args: { session_hash: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
