import { useEffect } from 'react';
import { BRAND_NAME } from '@/shared/constants/brand';

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — ${BRAND_NAME}` : BRAND_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
