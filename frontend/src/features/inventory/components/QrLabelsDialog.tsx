import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Skeleton, Typography } from '@mui/material';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import QRCode from 'qrcode';
import { escapeHtml } from '@/shared/utils/html';
import { tr } from '@/i18n';

export interface QrLabel {
  key: string;
  qr: string;
  title: string;
  subtitle: string;
}

interface Props {
  open: boolean;
  title: string;
  labels: QrLabel[] | null;
  onClose: () => void;
}

export default function QrLabelsDialog({ open, title, labels, onClose }: Props) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !labels) return;
    setSelected(new Set(labels.map((l) => l.key)));
    Promise.all(labels.map(async (l) => [l.key, await QRCode.toDataURL(l.qr, { margin: 1, width: 240, errorCorrectionLevel: 'M' })] as const))
      .then((pairs) => setImages(Object.fromEntries(pairs)))
      .catch(() => setImages({}));
  }, [open, labels]);

  const chosen = (labels ?? []).filter((l) => selected.has(l.key));
  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const print = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const html = chosen
      .map((l) => `<div class="l"><img src="${images[l.key]}"/><div><b>${escapeHtml(l.title)}</b><br/><span>${escapeHtml(l.subtitle)}</span></div></div>`)
      .join('');
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;margin:8mm}.l{display:inline-flex;gap:8px;align-items:center;width:88mm;height:34mm;border:1px dashed #999;padding:3mm;margin:0 2mm 2mm 0;box-sizing:border-box;page-break-inside:avoid;font-size:12px;vertical-align:top}.l img{width:28mm;height:28mm}.l b{font-size:15px}span{color:#444}</style></head><body>${html}<script>window.onload=()=>{window.print()}<\/script></body></html>`,
    );
    w.document.close();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {title}
        <Typography variant="body2" color="text.secondary">
          {tr("Yorliqni javon yoki rulonga yopishtiring — omborchi rejimida telefon kamerasi bilan skanerlanadi.")}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {!labels ? (
          <Skeleton variant="rounded" height={200} />
        ) : labels.length === 0 ? (
          <Typography color="text.secondary">{tr("Yorliq uchun ma'lumot yo'q")}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {labels.map((l) => (
              <Box key={l.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1, border: 1, borderColor: 'divider', borderRadius: 2, opacity: selected.has(l.key) ? 1 : 0.45 }}>
                <FormControlLabel sx={{ m: 0 }} control={<Checkbox size="small" checked={selected.has(l.key)} onChange={() => toggle(l.key)} />} label="" />
                <Box sx={{ width: 72, height: 72, bgcolor: '#fff', borderRadius: 1, p: 0.5, flexShrink: 0 }}>
                  {images[l.key] && <img src={images[l.key]} alt={l.title} width="100%" height="100%" />}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>{l.title}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">{l.subtitle}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {tr('Tanlangan: {0}', chosen.length)}
        </Typography>
        <Button onClick={onClose} color="inherit">{tr('Yopish')}</Button>
        <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={print} disabled={!chosen.length || chosen.some((l) => !images[l.key])}>
          {tr('Chop etish')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
