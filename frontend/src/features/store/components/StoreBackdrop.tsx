import { Box } from '@mui/material';

export default function StoreBackdrop() {
  return <Box aria-hidden sx={{ position: 'fixed', inset: 0, zIndex: -1, bgcolor: 'background.default' }} />;
}
