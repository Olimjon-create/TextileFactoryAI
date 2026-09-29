import { api } from '@/shared/api/client';
import type { TokenResponse, User } from '@/shared/types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  factory_name: string;
  factory_address?: string;
}

export interface AuthConfig {
  google_client_id: string | null;
  registration_enabled: boolean;
}

export const authApi = {
  config: () => api.get<AuthConfig>('/auth/config').then((r) => r.data),
  login: (data: LoginPayload) => api.post<TokenResponse>('/auth/login', data).then((r) => r.data),
  google: (credential: string) =>
    api.post<TokenResponse>('/auth/google', { credential }).then((r) => r.data),
  register: (data: RegisterPayload) =>
    api.post<TokenResponse>('/auth/register', data).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }).then(() => undefined),
};
