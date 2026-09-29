import { Chip, Typography } from '@mui/material';
import { MACHINE_STATUS_COLORS, MACHINE_STATUS_LABELS } from '../constants';
import type { Machine } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

export function MachineStatusChip({ machine, size = 'small' }: { machine: Pick<Machine, 'status'>; size?: 'small' | 'medium' }) {
  return <Chip size={size} color={MACHINE_STATUS_COLORS[machine.status]} label={MACHINE_STATUS_LABELS[machine.status]} variant={machine.status === 'IDLE' ? 'outlined' : 'filled'} />;
}

/** Keyingi texnik xizmat: muddati o'tgan — qizil, 7 kun ichida — sariq */
export function MaintenanceDue({ machine }: { machine: Machine }) {
  if (!machine.next_maintenance_date) {
    return (
      <Typography variant="body2" color="text.secondary">
        {tr("Rejalashtirilmagan")}
      </Typography>
    );
  }
  const label = formatDate(machine.next_maintenance_date);
  if (machine.maintenance_overdue) return <Chip size="small" color="error" label={tr("{0} · muddati o'tgan", label)} />;
  if (machine.maintenance_due_soon) return <Chip size="small" color="warning" variant="outlined" label={tr("{0} · yaqinlashdi", label)} />;
  return <Typography variant="body2">{label}</Typography>;
}
