import { api } from '@/shared/api/client';
import type {
  CheckoutPayload,
  CheckoutResponse,
  PublicOrder,
  StoreFactoryCard,
  StoreFactoryDetail,
  ProductSort,
  StoreFeaturedProduct,
  StoreProductPage,
} from './types';

export const storeApi = {
  factories: (search?: string) =>
    api.get<StoreFactoryCard[]>('/store/factories', { params: { search: search || undefined } }).then((r) => r.data),
  products: (params: { search?: string; category?: string | null; sort?: ProductSort; limit?: number; offset?: number }) =>
    api
      .get<StoreProductPage>('/store/products', {
        params: { ...params, search: params.search || undefined, category: params.category || undefined },
      })
      .then((r) => r.data),
  featured: (limit = 3) =>
    api.get<StoreFeaturedProduct[]>('/store/featured', { params: { limit } }).then((r) => r.data),
  factory: (id: number) => api.get<StoreFactoryDetail>(`/store/factories/${id}`).then((r) => r.data),
  checkout: (data: CheckoutPayload) => api.post<CheckoutResponse>('/store/orders', data).then((r) => r.data),
  order: (token: string) => api.get<PublicOrder>(`/store/orders/${token}`).then((r) => r.data),
  myOrders: (tokens: string[]) => api.post<PublicOrder[]>('/store/orders/my', { tokens }).then((r) => r.data),
  findOrder: (orderNumber: string, phone: string) =>
    api
      .post<PublicOrder>('/store/orders/find', { order_number: orderNumber, customer_phone: phone })
      .then((r) => r.data),
  payDemo: (token: string, cardLast4: string) =>
    api.post<PublicOrder>(`/store/orders/${token}/pay/demo`, { card_last4: cardLast4 }).then((r) => r.data),
};
