export type Role =
  | 'SUPER_ADMIN'
  | 'FACTORY_OWNER'
  | 'MANAGER'
  | 'PRODUCTION_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'QUALITY_MANAGER'
  | 'WORKER';

export interface FactoryBrief {
  id: number;
  name: string;
}

export interface Factory {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  users_count: number;
  created_at: string;
  // Mijozlar katalogidagi profil
  is_public: boolean;
  city: string | null;
  short_description: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  factory_id: number | null;
  factory: FactoryBrief | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
