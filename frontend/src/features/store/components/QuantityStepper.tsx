import { useEffect, useState } from 'react';
import { Box, Button, IconButton, InputBase } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import AddShoppingCartOutlinedIcon from '@mui/icons-material/AddShoppingCartOutlined';
import { MAX_QUANTITY } from '../CartContext';
import { tr } from '@/i18n';

interface Props {
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium';
  /** 0 bo'lganda "Savatga" tugmasini ko'rsatish */
  showAddButton?: boolean;
}

/** Miqdor tanlash: [-] [son] [+]. Sonni qo'lda ham yozish mumkin (katta partiyalar uchun). */
export default function QuantityStepper({ value, onChange, size = 'medium', showAddButton = true }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  if (value === 0 && showAddButton) {
    return (
      <Button variant="contained" startIcon={<AddShoppingCartOutlinedIcon />} onClick={() => onChange(1)} sx={{ whiteSpace: 'nowrap' }}>
        {tr("Savatga")}
      </Button>
    );
  }

  const commit = () => {
    const n = Number(text.replace(/\s/g, ''));
    onChange(Number.isFinite(n) ? Math.max(0, Math.min(MAX_QUANTITY, Math.floor(n))) : value);
  };

  const h = size === 'small' ? 32 : 40;
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        border: 1,
        borderColor: 'primary.main',
        borderRadius: 2,
        height: h,
        overflow: 'hidden',
      }}
    >
      <IconButton size="small" aria-label={tr("Kamaytirish")} onClick={() => onChange(value - 1)} sx={{ borderRadius: 0, height: h, width: h }}>
        <RemoveIcon fontSize="small" />
      </IconButton>
      <InputBase
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputProps={{ inputMode: 'numeric', 'aria-label': tr("Miqdor"), style: { textAlign: 'center', fontWeight: 600, padding: 0 } }}
        sx={{ width: Math.max(44, text.length * 10 + 20) }}
      />
      <IconButton
        size="small"
        aria-label={tr("Ko'paytirish")}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QUANTITY}
        sx={{ borderRadius: 0, height: h, width: h, color: 'primary.main' }}
      >
        <AddIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
