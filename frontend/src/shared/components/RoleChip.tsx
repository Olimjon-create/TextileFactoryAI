import { Chip } from '@mui/material';
import { ROLE_COLORS, ROLE_LABELS } from '@/shared/constants/roles';
import type { Role } from '@/shared/types';

export default function RoleChip({ role }: { role: Role }) {
  return <Chip size="small" label={ROLE_LABELS[role]} color={ROLE_COLORS[role]} variant="outlined" />;
}
