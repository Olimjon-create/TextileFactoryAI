import { Box, Chip, Tooltip, Typography } from '@mui/material';

export default function VariantChips({ values, max = 4, compact = false, range = true }: { values: string[]; max?: number; compact?: boolean; range?: boolean }) {
  if (values.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  if (compact) {
    const many = values.length > (range ? 3 : 2);
    const text = !many ? values.join(', ') : range ? `${values[0]}–${values[values.length - 1]}` : values.slice(0, 2).join(', ');
    return (
      <Tooltip title={values.join(', ')}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{text}</Typography>
          {many && <Chip label={range ? values.length : `+${values.length - 2}`} size="small" sx={{ height: 20, fontSize: 11 }} />}
        </Box>
      </Tooltip>
    );
  }
  const visible = values.slice(0, max);
  const rest = values.slice(max);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {visible.map((v) => (
        <Chip key={v} label={v} size="small" variant="outlined" />
      ))}
      {rest.length > 0 && (
        <Tooltip title={rest.join(', ')}>
          <Chip label={`+${rest.length}`} size="small" />
        </Tooltip>
      )}
    </Box>
  );
}
