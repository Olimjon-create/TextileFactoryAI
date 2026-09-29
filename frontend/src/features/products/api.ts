import { api } from '@/shared/api/client';
import type {
  BOMItem,
  BOMItemPayload,
  Product,
  ProductFilters,
  ProductListItem,
  ProductPayload,
} from './types';

const clean = (f: ProductFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined));

export const productsApi = {
  list: (filters: ProductFilters = {}) =>
    api.get<ProductListItem[]>('/products', { params: clean(filters) }).then((r) => r.data),
  categories: () => api.get<string[]>('/products/categories').then((r) => r.data),
  get: (id: number) => api.get<Product>(`/products/${id}`).then((r) => r.data),
  create: (data: ProductPayload) => api.post<Product>('/products', data).then((r) => r.data),
  update: (id: number, data: Partial<ProductPayload>) =>
    api.patch<Product>(`/products/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/products/${id}`),
};

export const bomApi = {
  create: (productId: number, data: BOMItemPayload) =>
    api.post<BOMItem>(`/products/${productId}/bom`, data).then((r) => r.data),
  update: (productId: number, itemId: number, data: Partial<BOMItemPayload>) =>
    api.patch<BOMItem>(`/products/${productId}/bom/${itemId}`, data).then((r) => r.data),
  remove: (productId: number, itemId: number) => api.delete(`/products/${productId}/bom/${itemId}`),
};
