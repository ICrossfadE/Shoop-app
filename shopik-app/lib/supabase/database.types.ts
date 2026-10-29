import type { Product } from '../products';
import type { Category } from '../categories';
import type { Expense, ExpenseMonth } from '../expenses';
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
      expenses: { Row: Expense; Insert: never; Update: never; Relationships: [] };
      categories: { Row: Category; Insert: Pick<Category, 'workspace_id' | 'name'>; Update: Pick<Category, 'name'>; Relationships: [] };
      products: {
        Row: Product;
        Insert: Pick<Product, 'workspace_id' | 'name' | 'price' | 'category_id'> & Partial<Pick<Product, 'description'>>;
        Update: Partial<Pick<Product, 'name' | 'description' | 'price' | 'status' | 'category_id'>>;
        Relationships: [];
      };
      profiles: { Row: Profile; Insert: Profile; Update: Partial<Pick<Profile, 'display_name'>>; Relationships: [] };
      workspaces: { Row: Workspace; Insert: Workspace; Update: Partial<Pick<Workspace, 'name'>>; Relationships: [] };
      workspace_members: { Row: Membership; Insert: Membership; Update: Partial<Pick<Membership, 'role'>>; Relationships: [] };
    };
    Views: { [_ in never]: never };
    Functions: {
      expense_month: { Args: { p_workspace_id: string; p_month: string }; Returns: ExpenseMonth };
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
