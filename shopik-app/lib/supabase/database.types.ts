import type { Product } from '../products';
import type { Category } from '../categories';
import type { Expense, ExpenseMonth } from '../expenses';
import type { Tag, TaggedProduct } from '../tags';
import type { ProductAuthor } from '../identity';
// Keep in sync with the versioned SQL migrations.
type Profile = { id: string; display_name: string; avatar_url: string; theme: 'light' | 'dark'; created_at: string };
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
      tags: { Row: Tag; Insert: Pick<Tag, 'workspace_id' | 'name' | 'color'>; Update: never; Relationships: [] };
      product_tags: { Row: { workspace_id: string; product_id: string; tag_id: string }; Insert: { workspace_id: string; product_id: string; tag_id: string }; Update: never; Relationships: [] };
      expenses: { Row: Expense; Insert: never; Update: never; Relationships: [] };
      categories: { Row: Category; Insert: Pick<Category, 'workspace_id' | 'name'>; Update: Pick<Category, 'name'>; Relationships: [] };
      products: {
        Row: Product;
        Insert: Pick<Product, 'workspace_id' | 'name' | 'price' | 'category_id'> & Partial<Pick<Product, 'description'>>;
        Update: Partial<Pick<Product, 'name' | 'description' | 'price' | 'status' | 'category_id'>>;
        Relationships: [];
      };
      profiles: { Row: Profile; Insert: Profile; Update: Partial<Pick<Profile, 'display_name' | 'theme'>>; Relationships: [] };
      workspaces: { Row: Workspace; Insert: Workspace; Update: Partial<Pick<Workspace, 'name'>>; Relationships: [] };
      workspace_members: { Row: Membership; Insert: Membership; Update: Partial<Pick<Membership, 'role'>>; Relationships: [] };
    };
    Views: { [_ in never]: never };
    Functions: {
      workspace_product_authors: { Args: { p_workspace_id: string }; Returns: ProductAuthor[] };
      save_product_tags: { Args: { p_workspace_id: string; p_product_id: string | null; p_name: string; p_description: string; p_price: number; p_category_id: string; p_tag_ids: string[] }; Returns: string };
      filtered_products: { Args: { p_workspace_id: string; p_category_id: string; p_tag_ids: string[] }; Returns: TaggedProduct[] };
      expense_month_tags: { Args: { p_workspace_id: string; p_month: string; p_tag_ids: string[] }; Returns: ExpenseMonth };
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
