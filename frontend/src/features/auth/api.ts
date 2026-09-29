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
  password_reset_enabled: boolean;
}

export interface TelegramStatus {
  enabled: boolean;
  bot_username: string | null;
  linked: boolean;
  link_url: string | null;
  shop_url: string | null;
}

const fid = (factoryId?: number | '') => ({ params: factoryId ? { factory_id: factoryId } : {} });

export const telegramApi = {
  status: (factoryId?: number | '') => api.get<TelegramStatus>('/telegram/status', fid(factoryId)).then((r) => r.data),
  check: (factoryId?: number | '') => api.post<TelegramStatus>('/telegram/check', null, fid(factoryId)).then((r) => r.data),
  test: (factoryId?: number | '') => api.post('/telegram/test', null, fid(factoryId)).then(() => undefined),
  unlink: (factoryId?: number | '') => api.delete<TelegramStatus>('/telegram', fid(factoryId)).then((r) => r.data),
};

export const authApi = {
  config: () => api.get<AuthConfig>('/auth/config').then((r) => r.data),
  login: (data: LoginPayload) => api.post<TokenResponse>('/auth/login', data).then((r) => r.data),
  google: (credential: string) =>
    api.post<TokenResponse>('/auth/google', { credential }).then((r) => r.data),
  register: (data: RegisterPayload) =>
    api.post<TokenResponse>('/auth/register', data).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }).then(() => undefined),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }).then(() => undefined),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }).then(() => undefined),
};
