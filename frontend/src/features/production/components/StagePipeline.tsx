import { Box, LinearProgress, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { STAGE_SHORT } from '../constants';
import type { WorkOrder } from '../types';
import { tr } from '@/i18n';

export default function StagePipeline({ wo, compact = false }: { wo: WorkOrder; compact?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gap: compact ? 0.75 : 1.5, gridTemplateColumns: { xs: compact ? 'repeat(5, 1fr)' : '1fr 1fr', sm: 'repeat(5, 1fr)' } }}>
      {wo.progress.map((p) => {
        const current = wo.current_stage === p.stage;
        const target = p.stage === 'CUTTING' ? wo.quantity : p.available;
        const pct = target ? Math.min(100, (p.good / target) * 100) : 0;
        const done = !current && pct >= 100;
        if (compact) {
          return (
            <Box key={p.stage} title={tr("{0}: {1} yaroqli{2}", STAGE_SHORT[p.stage], p.good, p.defect ? tr(", {0} brak", p.defect) : '')}>
              <LinearProgress variant="determinate" value={pct} color={p.defect ? 'warning' : done ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3, opacity: current || pct > 0 ? 1 : 0.35 }} />
              <Typography variant="caption" color={current ? 'primary.main' : 'text.secondary'} sx={{ fontWeight: current ? 700 : 400, fontSize: 10.5 }}>
                {STAGE_SHORT[p.stage]}
              </Typography>
            </Box>
          );
        }
        return (
          <Box
            key={p.stage}
            sx={(t) => ({
              p: 1.5,
              borderRadius: 2,
              border: 1,
              borderColor: current ? 'primary.main' : 'divider',
              bgcolor: current ? alpha(t.palette.primary.main, 0.08) : 'transparent',
            })}
          >
            <Typography variant="caption" color={current ? 'primary.main' : 'text.secondary'} sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {STAGE_SHORT[p.stage]}
              {current && tr(" · hozir")}
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
              {p.good}
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}
                / {target}
              </Typography>
            </Typography>
            <LinearProgress variant="determinate" value={pct} color={done ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3, my: 0.75 }} />
            <Typography variant="caption" color="text.secondary" display="block">
              {p.defect > 0 ? (
                <Box component="span" sx={{ color: 'error.main' }}>
                  {tr("Brak")}{' '}{p.defect} ({p.defect_rate}%)
                </Box>
              ) : (
                tr("Brak yo‘q")
              )}
              {p.remaining > 0 && tr(" · qoldi {0}", p.remaining)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
