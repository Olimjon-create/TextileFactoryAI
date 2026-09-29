import { Button, CircularProgress, type ButtonProps } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { SaveStatus } from '@/shared/hooks/useSaveAction';
import { tr } from '@/i18n';

interface Props extends Omit<ButtonProps, 'color'> {
  status: SaveStatus;
  savingText?: string;
  savedText?: string;
}

export default function SaveButton({
  status,
  children = tr("Saqlash"),
  savingText = tr("Saqlanmoqda..."),
  savedText = tr("Saqlandi"),
  disabled,
  sx,
  ...rest
}: Props) {
  const saving = status === 'saving';
  const saved = status === 'saved';
  return (
    <Button
      type="submit"
      variant="contained"
      {...rest}
      color={saved ? 'success' : 'primary'}
      disabled={saving || disabled}
      startIcon={saving ? <CircularProgress size={18} color="inherit" /> : saved ? <CheckIcon /> : rest.startIcon}
      sx={[{ minWidth: 150, transition: 'background-color .3s' }, saved && { pointerEvents: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {saving ? savingText : saved ? savedText : children}
    </Button>
  );
}
