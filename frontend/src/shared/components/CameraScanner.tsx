import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { tr } from '@/i18n';

interface DetectedCode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedCode[]>;
}

type DetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

export const cameraScanSupported = (): boolean => !!Detector && !!navigator.mediaDevices?.getUserMedia;

export default function CameraScanner({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (!cameraScanSupported()) {
      setError(tr("Bu brauzer kamera orqali skanerlashni qo'llab-quvvatlamaydi. Chrome (Android) dan foydalaning yoki kodni qo'lda kiriting."));
      return;
    }
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const detector = new Detector!({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] });
    const tick = async () => {
      if (stopped || !video.current) return;
      const codes = await detector.detect(video.current).catch(() => [] as DetectedCode[]);
      if (codes.length && codes[0].rawValue) {
        stopped = true;
        onResult(codes[0].rawValue.trim());
        return;
      }
      timer = window.setTimeout(tick, 250);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        video.current.play().then(() => tick()).catch(() => tick());
      })
      .catch(() => setError(tr("Kameraga ruxsat berilmadi. Brauzer sozlamalarida kameraga ruxsat bering.")));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onResult]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{tr('QR kodni skanerlang')}</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="warning">{error}</Alert>
        ) : (
          <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: '#000', aspectRatio: '1 / 1' }}>
            <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <Box sx={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: 2 }} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tr('Yopish')}</Button>
      </DialogActions>
    </Dialog>
  );
}
