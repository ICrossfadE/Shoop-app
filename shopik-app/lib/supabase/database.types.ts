import type { Product } from '../products';
// Keep in sync with the versioned SQL migrations.
type Profile = { id: string; display_name: string; created_at: string };
type Workspace = {
  id: string;
  name: string;
  owner_id: string;
  is_personal: boolean;
  created_at: string;
};
type Membership = {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'member';
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Pick<Product, 'workspace_id' | 'name' | 'price'> & Partial<Pick<Product, 'description'>>;
        Update: Partial<Pick<Product, 'name' | 'description' | 'price' | 'status'>>;
        Relationships: [];
      };
      profiles: { Row: Profile; Insert: Profile; Update: Partial<Pick<Profile, 'display_name'>>; Relationships: [] };
      workspaces: { Row: Workspace; Insert: Workspace; Update: Partial<Pick<Workspace, 'name'>>; Relationships: [] };
      workspace_members: { Row: Membership; Insert: Membership; Update: Partial<Pick<Membership, 'role'>>; Relationships: [] };
    };
    Views: { [_ in never]: never };
    Functions: {
      ensure_personal_workspace: {
        Args: Record<string, never>;
        Returns: { workspace_id: string; workspace_name: string; member_role: 'owner' | 'member' }[];
      };
      is_workspace_member: { Args: { target_workspace_id: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
