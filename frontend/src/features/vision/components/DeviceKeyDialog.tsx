import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { DeviceWithKey } from '../types';
import { tr } from '@/i18n';

/** Qurilma kaliti faqat shu yerda bir marta ko'rsatiladi (bazada faqat xeshi saqlanadi) */
export default function DeviceKeyDialog({ device, onClose }: { device: DeviceWithKey | null; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  if (!device) return null;
  const endpoint = `${window.location.origin}/api/v1/vision/ingest`;
  const sample = `curl -X POST ${endpoint} \\
  -H "X-Device-Key: ${device.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"events":[{"event_type":"COUNT","external_id":"cam01-000001","quantity":12,"confidence":0.94}]}'`;
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => setCopied(what)).catch(() => undefined);
  };
  const Block = ({ text, what }: { text: string; what: string }) => (
    <Box sx={{ position: 'relative', bgcolor: 'action.hover', borderRadius: 2, p: 1.5, pr: 5, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
      {text}
      <Tooltip title={copied === what ? tr("Nusxa olindi") : tr("Nusxa olish")}>
        <IconButton size="small" onClick={() => copy(text, what)} sx={{ position: 'absolute', top: 6, right: 6 }}>
          <ContentCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{device.code}{tr(": qurilma kaliti")}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tr("Kalitni hozir nusxalab qurilmaga (AI dasturiga) kiriting — u boshqa ko'rsatilmaydi. Yo'qolsa, «Kalitni almashtirish» qiling.")}
        </Alert>
        <Block text={device.api_key} what="key" />
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
          {tr("Hodisa yuborish namunasi")}
        </Typography>
        <Block text={sample} what="curl" />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {tr("Hodisa turlari: COUNT (sanoq), DEFECT (brak, defect_reason bilan), MACHINE_STATE (machine_state: WORKING / IDLE / BROKEN), CUSTOM. Bo'sh «events» — «tirikman» signali. Batafsil: README → «AI / Computer Vision integratsiyasi».")}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose}>
          {tr("Nusxaladim")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
