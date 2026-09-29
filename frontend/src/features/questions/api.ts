import { api } from '@/shared/api/client';

export type QuestionStatus = 'NEW' | 'ANSWERED';

export interface StoreQuestion {
  id: number;
  factory_id: number;
  factory_name: string;
  product_id: number | null;
  product_name: string | null;
  customer_name: string;
  customer_phone: string;
  question: string;
  status: QuestionStatus;
  created_at: string;
  answered_at: string | null;
}

export interface QuestionPage {
  items: StoreQuestion[];
  total: number;
  new_count: number;
}

export const questionsApi = {
  list: (params: { status?: QuestionStatus | ''; factory_id?: number | ''; offset?: number; limit?: number }) =>
    api
      .get<QuestionPage>('/questions', {
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)),
      })
      .then((r) => r.data),
  setStatus: (id: number, status: QuestionStatus) =>
    api.patch<StoreQuestion>(`/questions/${id}`, { status }).then((r) => r.data),
};
