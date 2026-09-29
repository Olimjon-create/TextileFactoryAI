import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Avatar, Box, Card, CardContent, Chip, Skeleton, Typography, alpha } from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import { StatCardSkeleton } from '@/shared/components/skeletons';
import { ROLE_LABELS, ROLES } from '@/shared/constants/roles';
import { analyticsApi } from '@/features/analytics/api';
import ManagementOverview, { DefectsCard, OrdersStatusCard, PackedCard, TILE_GRID } from '@/features/analytics/components/ManagementOverview';
import RevenueDialog from '@/features/analytics/components/RevenueDialog';
import type { Overview } from '@/features/analytics/types';
import { ATTENDANCE_VIEW_ROLES } from '@/features/attendance/permissions';
import { dashboardApi, type DashboardStats } from '../api';
import { WORKFORCE_VIEW_ROLES } from '@/features/resources/permissions';
import AttendanceTodayCard from '../components/AttendanceTodayCard';
import EmployeesCard from '../components/EmployeesCard';
import MonthSummaryRow from '../components/MonthSummaryRow';
import RevenueCard from '../components/RevenueCard';
import { tr } from '@/i18n';

function Row({ children, cols }: { children: ReactNode; cols: { lg: string; xl?: string } }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: { xs: 1.5, sm: 2 },
        mb: { xs: 2, sm: 2.5 },
        gridTemplateColumns: { xs: '1fr', lg: cols.lg },
        '@media (min-width: 1900px)': cols.xl ? { gridTemplateColumns: cols.xl } : {},
      }}
    >
      {children}
    </Box>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState('');
  const [revenueOpen, setRevenueOpen] = useState(false);

  useEffect(() => {
    dashboardApi
      .stats()
      .then(setStats)
      .catch((e) => setError(getErrorMessage(e)));
    analyticsApi
      .overview()
      .then(setOverview)
      .catch(() => undefined)
      .finally(() => setOverviewLoading(false));
  }, []);

  if (!user) return null;
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const visibleRoles = ROLES.filter((r) => isSuperAdmin || r !== 'SUPER_ADMIN');
  const canSeeAttendance = hasRole(...ATTENDANCE_VIEW_ROLES);
  const sideCard = hasRole(...WORKFORCE_VIEW_ROLES) ? <EmployeesCard /> : canSeeAttendance ? <AttendanceTodayCard /> : null;
  const sales = overview?.sales ?? null;
  const production = overview?.production ?? null;

  return (
    <>
      <PageHeader
        title={tr("Xush kelibsiz, {0}!", user.full_name.split(' ')[0])}
        subtitle={isSuperAdmin ? tr("Butun platforma bo'yicha umumiy ko'rsatkichlar") : tr("{0} — bugungi holat va asosiy ko'rsatkichlar", user.factory?.name ?? '')}
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {overviewLoading ? (
        <Box sx={{ ...TILE_GRID, mb: 2.5 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </Box>
      ) : (
        overview && <ManagementOverview data={overview} onRevenueClick={() => setRevenueOpen(true)} />
      )}

      <MonthSummaryRow />

      {(sales || sideCard) && (
        <Row cols={sales && sideCard ? { lg: tr("2fr 1fr"), xl: tr("5fr 2fr") } : { lg: '1fr' }}>
          {sales && <RevenueCard />}
          {sideCard}
        </Row>
      )}

      {(production || sales) && (
        <Row cols={{ lg: production ? tr("3fr 2fr") : '1fr', xl: production && sales ? tr("2fr 1fr 1fr") : undefined }}>
          {production && <PackedCard data={production} />}
          <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, '@media (min-width: 1900px)': { display: 'contents' } }}>
            {sales && <OrdersStatusCard sales={sales} />}
            {production && <DefectsCard data={production} />}
          </Box>
        </Row>
      )}

      <Row cols={{ lg: tr("2fr 1fr") }}>
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography variant="h6">{tr("Tizim foydalanuvchilari")}</Typography>
                <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>{tr("Dasturga kira oladigan akkauntlar, rollar bo'yicha")}</Typography>
              </Box>
              {stats && (
                <Box sx={{ display: 'flex', gap: 2.5 }}>
                  {isSuperAdmin && <MiniStat label={tr("Fabrikalar")} value={`${stats.active_factories}/${stats.total_factories}`} />}
                  <MiniStat label={tr("Jami")} value={stats.total_users} />
                  <MiniStat label={tr("Faol")} value={stats.active_users} color="success.main" />
                </Box>
              )}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4 }}>
              {stats
                ? visibleRoles.map((role) => {
                    const count = stats.users_by_role[role] ?? 0;
                    const pct = stats.total_users ? (count / stats.total_users) * 100 : 0;
                    return (
                      <Box key={role} sx={{ mb: 1.75 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: count ? 'text.primary' : 'text.secondary' }}>
                            {ROLE_LABELS[role]}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: count ? 'text.primary' : 'text.disabled' }}>
                            {count}
                          </Typography>
                        </Box>
                        <Box sx={(t) => ({ height: 8, borderRadius: 4, bgcolor: alpha(t.palette.text.primary, 0.07), overflow: 'hidden' })}>
                          <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: 'primary.main', borderRadius: 4, transition: 'width .4s ease' }} />
                        </Box>
                      </Box>
                    );
                  })
                : visibleRoles.map((role) => (
                    <Box key={role} sx={{ mb: 1.75 }}>
                      <Skeleton width="40%" />
                      <Skeleton variant="rounded" height={8} />
                    </Box>
                  ))}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Avatar sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', width: 48, height: 48, fontWeight: 800 }}>{initials(user.full_name)}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 17 }} noWrap>
                  {user.full_name}
                </Typography>
                <Chip size="small" label={ROLE_LABELS[user.role]} color="primary" variant="outlined" />
              </Box>
            </Box>
            <InfoRow label={tr("Email")} value={user.email} />
            {user.phone && <InfoRow label={tr("Telefon")} value={user.phone} />}
            {user.factory && <InfoRow label={tr("Fabrika")} value={user.factory.name} />}
            {stats && !isSuperAdmin && (
              <InfoRow
                label={tr("Fabrika holati")}
                value={<Chip size="small" label={stats.active_factories ? tr("Faol") : tr("Nofaol")} color={stats.active_factories ? 'success' : 'default'} />}
              />
            )}
          </CardContent>
        </Card>
      </Row>

      {sales && <RevenueDialog open={revenueOpen} onClose={() => setRevenueOpen(false)} />}
    </>
  );
}

function MiniStat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 1.1, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</Box>
    </Box>
  );
}
