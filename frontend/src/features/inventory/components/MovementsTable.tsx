import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatSignedQty, MOVEMENT_TYPE_COLORS, MOVEMENT_TYPE_LABELS } from '../constants';
import type { Movement } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

interface Props {
  movements: Movement[];
  loading: boolean;
  /** Material sahifasida material ustuni kerak emas */
  showMaterial?: boolean;
  emptyText: string;
}

function Qty({ m }: { m: Movement }) {
  return (
    <Typography
      component="span"
      sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: m.quantity > 0 ? 'success.main' : m.quantity < 0 ? 'error.main' : 'text.primary' }}
    >
      {formatSignedQty(m.quantity)} {MATERIAL_UNIT_LABELS[m.material_unit]}
    </Typography>
  );
}

const TypeChip = ({ m }: { m: Movement }) => (
  <Chip size="small" label={MOVEMENT_TYPE_LABELS[m.movement_type]} color={MOVEMENT_TYPE_COLORS[m.movement_type]} variant="outlined" />
);

/** Harakatlar jurnali: kompyuterda jadval, telefonda kartalar */
export default function MovementsTable({ movements, loading, showMaterial = true, emptyText }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Box>
        {loading && movements.length === 0 && <MobileListSkeleton />}
        {movements.map((m) => (
          <MobileListItem
            key={m.id}
            overline={formatDateTime(m.created_at)}
            title={showMaterial ? `${m.material.code} — ${m.material.name}` : MOVEMENT_TYPE_LABELS[m.movement_type]}
            subtitle={[m.location.code, m.document_no, m.created_by_name].filter(Boolean).join(' · ')}
            trailing={<Qty m={m} />}
            meta={showMaterial ? <TypeChip m={m} /> : m.note ? <Typography variant="caption" color="text.secondary">{m.note}</Typography> : undefined}
          />
        ))}
        {!loading && movements.length === 0 && <MobileListEmpty>{emptyText}</MobileListEmpty>}
      </Box>
    );
  }

  const cols = showMaterial ? 7 : 6;
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 860 }}>
        <TableHead>
          <TableRow>
            <TableCell>{tr("Sana")}</TableCell>
            <TableCell>{tr("Turi")}</TableCell>
            {showMaterial && <TableCell>{tr("Material")}</TableCell>}
            <TableCell>{tr("Joy")}</TableCell>
            <TableCell align="right">{tr("Miqdor")}</TableCell>
            <TableCell>{tr("Hujjat / izoh")}</TableCell>
            <TableCell>{tr("Kim")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && movements.length === 0 && <TableRowsSkeleton cols={cols} />}
          {movements.map((m) => (
            <TableRow key={m.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.created_at)}</TableCell>
              <TableCell>
                <TypeChip m={m} />
              </TableCell>
              {showMaterial && (
                <TableCell>
                  <Typography
                    component={RouterLink}
                    to={`/inventory/materials/${m.material.id}`}
                    sx={{ fontSize: 14, fontWeight: 600, color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                  >
                    {m.material.code}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
                    {m.material.name}
                  </Typography>
                </TableCell>
              )}
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {m.location.code}
                <Typography variant="body2" color="text.secondary">
                  {m.location.name}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Qty m={m} />
              </TableCell>
              <TableCell sx={{ maxWidth: 260 }}>
                {m.document_no && <Typography sx={{ fontSize: 14, fontFamily: 'monospace' }}>{m.document_no}</Typography>}
                {m.order_number && <Typography sx={{ fontSize: 13 }}>{tr("Buyurtma")}{' '}{m.order_number}</Typography>}
                {m.note && (
                  <Typography variant="body2" color="text.secondary" noWrap title={m.note}>
                    {m.note}
                  </Typography>
                )}
                {!m.document_no && !m.note && !m.order_number && '—'}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{m.created_by_name ?? '—'}</TableCell>
            </TableRow>
          ))}
          {!loading && movements.length === 0 && (
            <TableRow>
              <TableCell colSpan={cols} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
