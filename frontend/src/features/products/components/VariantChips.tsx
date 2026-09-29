import { Box, Chip, Tooltip, Typography } from '@mui/material';

/** O'lcham yoki ranglarni ixcham ko'rsatadi: birinchi `max` tasi va "+N" */
export default function VariantChips({ values, max = 4 }: { values: string[]; max?: number }) {
  if (values.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
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
