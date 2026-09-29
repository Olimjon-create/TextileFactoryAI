import { useState } from 'react';
import { Button, CircularProgress, Tooltip } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { getErrorMessage } from '@/shared/api/client';
import { downloadCsv, today, type CsvValue } from '@/shared/utils/csv';
import { tr } from '@/i18n';

interface Props {
  name: string;
  headers: string[];
  load: () => Promise<CsvValue[][]>;
}

export default function ExportButton({ name, headers, load }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      downloadCsv(`${name}_${today()}`, headers, await load());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip title={error || tr("Joriy filtr bo'yicha hamma yozuvlar — Excel'da ochiladi")}>
      <Button
        variant="outlined"
        color={error ? 'error' : 'inherit'}
        onClick={run}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FileDownloadOutlinedIcon />}
      >
        {tr("Excel")}
      </Button>
    </Tooltip>
  );
}
