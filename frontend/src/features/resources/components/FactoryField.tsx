import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import type { Factory } from '@/shared/types';
import { tr } from '@/i18n';

/** Faqat SUPER_ADMIN yangi yozuv yaratganda ko'rinadi: qaysi fabrikaga tegishli */
export function useNeedsFactory(isNew: boolean) {
  const { user } = useAuth();
  return user?.role === 'SUPER_ADMIN' && isNew;
}

export default function FactoryField({ value, onChange }: { value: number | ''; onChange: (id: number) => void }) {
  const [factories, setFactories] = useState<Factory[]>([]);
  useEffect(() => {
    factoriesApi.list().then(setFactories).catch(() => undefined);
  }, []);
  return (
    <TextField select label={tr("Fabrika")} required value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {factories.map((f) => (
        <MenuItem key={f.id} value={f.id}>
          {f.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
