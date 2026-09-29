import { Chip } from '@mui/material';
import { PRODUCT_STATUS_COLORS, PRODUCT_STATUS_LABELS } from '../constants';
import type { ProductStatus } from '../types';

export default function ProductStatusChip({ status }: { status: ProductStatus }) {
  return <Chip size="small" label={PRODUCT_STATUS_LABELS[status]} color={PRODUCT_STATUS_COLORS[status]} />;
}
