import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import QRCode from 'qrcode';
import { escapeHtml } from '@/shared/utils/html';
import type { TrackingUnit } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  units: TrackingUnit[];
  onClose: () => void;
}

const esc = escapeHtml;

export default function LabelsDialog({ open, units, onClose }: Props) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    Promise.all(units.map(async (u) => [u.code, await QRCode.toDataURL(u.code, { margin: 1, width: 240, errorCorrectionLevel: 'M' })] as const))
      .then((pairs) => setImages(Object.fromEntries(pairs)))
      .catch(() => setImages({}));
  }, [open, units]);

  const print = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const labels = units
      .map(
        (u) => `<div class="l"><img src="${images[u.code]}"/><div><b>${esc(u.code)}</b><br/>${esc(u.product_name)}<br/>${[u.size, u.color].filter(Boolean).map((x) => esc(x!)).join(' · ')}<br/><span>${u.kind === 'BUNDLE' ? tr("Partiya") : tr("Quti")}: ${u.quantity} dona</span></div></div>`,
      )
      .join('');
    w.document.write(
      `<!doctype html><html><head><title>Yorliqlar</title><style>body{font-family:Arial,sans-serif;margin:8mm}.l{display:inline-flex;gap:8px;align-items:center;width:88mm;height:34mm;border:1px dashed #999;padding:3mm;margin:0 2mm 2mm 0;box-sizing:border-box;page-break-inside:avoid;font-size:11px;vertical-align:top}.l img{width:28mm;height:28mm}.l b{font-size:13px}span{color:#444}</style></head><body>${labels}<script>window.onload=()=>{window.print()}<\/script></body></html>`,
    );
    w.document.close();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{tr("QR yorliqlar (")}{units.length})</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pt: 1 }}>
          {units.map((u) => (
            <Box key={u.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Box sx={{ width: 96, height: 96, bgcolor: '#fff', borderRadius: 1, p: 0.5, flexShrink: 0 }}>
                {images[u.code] && <img src={images[u.code]} alt={u.code} width="100%" height="100%" />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{u.code}</Typography>
                <Typography variant="body2" noWrap>
                  {u.product_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[u.size, u.color].filter(Boolean).join(' · ')} · {u.kind === 'BUNDLE' ? tr("Partiya") : tr("Quti")}: {u.quantity} {tr("dona")}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          {tr("Yopish")}
        </Button>
        <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={print} disabled={Object.keys(images).length < units.length}>
          {tr("Chop etish")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
