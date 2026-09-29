import { Box } from '@mui/material';
import { BRAND_PARTS } from '@/shared/constants/brand';

/** Dastur nomi logotip ko'rinishida: "Textile" + urg'u rangidagi "Core" (Typography ichida ishlatiladi) */
export default function BrandWordmark({ accent = 'secondary.main' }: { accent?: string }) {
  return (
    <>
      {BRAND_PARTS[0]}
      <Box component="span" sx={{ color: accent }}>
        {BRAND_PARTS[1]}
      </Box>
    </>
  );
}
