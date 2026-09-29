import { useState } from 'react';
import { Alert, Button, CircularProgress } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import { inventoryApi } from '../api';
import type { WarehouseLocation } from '../types';
import { tr } from '@/i18n';

/**
 * Ombor joyi hali yo'q: kirim oynasidan chiqmasdan birinchi joyni ("A-1 — Asosiy ombor") yaratish.
 * Keyin «Ombor joylari» sahifasida nomini o'zgartirish yoki yangilarini qo'shish mumkin.
 */
export default function NoLocationsAlert({ factoryId, onCreated }: { factoryId?: number; onCreated: (l: WarehouseLocation) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      onCreated(await inventoryApi.createLocation({ code: 'A-1', name: 'Asosiy ombor', factory_id: factoryId }));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert
      severity={error ? 'error' : 'info'}
      action={
        <Button color="inherit" size="small" onClick={create} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {tr("Yaratish")}
        </Button>
      }
    >
      {error || tr("Hali ombor joyi yo'q. Mahsulot qayerda saqlanishini bilish uchun kamida bitta joy kerak — «Asosiy ombor» yaratilsinmi?")}
    </Alert>
  );
}
