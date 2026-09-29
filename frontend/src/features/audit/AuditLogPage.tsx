import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { api, getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

interface AuditLog {
  id: number;
  factory_id: number | null;
  user_id: number | null;
  user_name: string | null;
  entity: string;
  entity_id: number | null;
  action: string;
  summary: string;
  changes: Record<string, unknown> | null;
  created_at: string;
}

const ENTITY_LABELS: Record<string, string> = {
  material: tr("Material"),
  stock_movement: tr("Ombor harakati"),
  warehouse_location: tr("Ombor joyi"),
  product: tr("Mahsulot"),
  order: tr("Buyurtma"),
  session: tr("Tizimga kirish"),
};

const ACTION_LABELS: Record<string, { label: string; color: 'success' | 'info' | 'error' | 'warning' | 'secondary' }> = {
  CREATE: { label: tr("Qo'shildi"), color: 'success' },
  UPDATE: { label: tr("O'zgartirildi"), color: 'info' },
  DELETE: { label: tr("O'chirildi"), color: 'error' },
  STATUS: { label: tr("Holat"), color: 'warning' },
  STOCK: { label: tr("Ombor"), color: 'secondary' },
  LOGIN: { label: tr("Kirdi"), color: 'success' },
  PASSWORD: { label: tr("Parol"), color: 'warning' },
};

const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Changes({ changes }: { changes: Record<string, unknown> }) {
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.5, fontSize: 13 }}>
      {Object.entries(changes).map(([field, value]) => (
        <Fragment key={field}>
          <Box component="dt" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
            {field}
          </Box>
          <Box component="dd" sx={{ m: 0 }}>
            {Array.isArray(value) && value.length === 2 ? (
              <>
                <Box component="span" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                  {fmt(value[0])}
                </Box>
                {' → '}
                <b>{fmt(value[1])}</b>
              </>
            ) : (
              fmt(value)
            )}
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}

function ActionChip({ action }: { action: string }) {
  const a = ACTION_LABELS[action] ?? { label: action, color: 'info' as const };
  return <Chip size="small" label={a.label} color={a.color} variant="outlined" />;
}

/** Audit log: kim, qachon, nimani o'zgartirdi */
export default function AuditLogPage() {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries({ search: search.trim(), entity, action, date_from: dateFrom, date_to: dateTo, offset: page * rowsPerPage, limit: rowsPerPage }).filter(
          ([, v]) => v !== '',
        ),
      );
      const { data } = await api.get<{ items: AuditLog[]; total: number }>('/audit-logs', { params });
      setItems(data.items);
      setTotal(data.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, entity, action, dateFrom, dateTo, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, entity, action, dateFrom, dateTo, rowsPerPage]);

  return (
    <>
      <PageHeader title={tr("Audit log")} subtitle={tr("Muhim amallar tarixi: kim, qachon va nimani o'zgartirdi")} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Tavsif yoki foydalanuvchi...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 240px', maxWidth: 320 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Obyekt")} value={entity} onChange={(e) => setEntity(e.target.value)} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label={tr("Amal")} value={action} onChange={(e) => setAction(e.target.value)} sx={{ width: 160 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField type="date" label={tr("Dan")} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label={tr("Gacha")} value={dateTo} onChange={(e) => setDateTo(e.target.value)} sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((l) => (
              <MobileListItem
                key={l.id}
                overline={`${formatDateTime(l.created_at)} · ${l.user_name ?? tr("Tizim")}`}
                title={l.summary}
                subtitle={ENTITY_LABELS[l.entity] ?? l.entity}
                trailing={<ActionChip action={l.action} />}
                meta={l.changes ? <Changes changes={l.changes} /> : undefined}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Yozuvlar topilmadi")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 820 }}>
              <TableHead>
                <TableRow>
                  <TableCell width={40} />
                  <TableCell>{tr("Vaqt")}</TableCell>
                  <TableCell>{tr("Foydalanuvchi")}</TableCell>
                  <TableCell>{tr("Amal")}</TableCell>
                  <TableCell>{tr("Obyekt")}</TableCell>
                  <TableCell>{tr("Tavsif")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={6} />}
                {items.map((l) => (
                  <Fragment key={l.id}>
                    <TableRow hover onClick={() => l.changes && setOpen(open === l.id ? null : l.id)} sx={{ cursor: l.changes ? 'pointer' : 'default', '& > td': { borderBottom: open === l.id ? 'none' : undefined } }}>
                      <TableCell>
                        {l.changes && <IconButton size="small">{open === l.id ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}</IconButton>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{l.user_name ?? '—'}</TableCell>
                      <TableCell>
                        <ActionChip action={l.action} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{ENTITY_LABELS[l.entity] ?? l.entity}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 14 }}>{l.summary}</Typography>
                      </TableCell>
                    </TableRow>
                    {l.changes && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ py: 0 }}>
                          <Collapse in={open === l.id} unmountOnExit>
                            <Box sx={{ py: 1.5, pl: 7 }}>
                              <Changes changes={l.changes} />
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Yozuvlar topilmadi")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => setRowsPerPage(Number(e.target.value))}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage={tr("Sahifada:")}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
        />
      </Card>
    </>
  );
}
