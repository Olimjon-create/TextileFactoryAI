import { useCallback, useState } from 'react';
import { Badge, Box, Button, Tab, Tabs } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PageHeader from '@/shared/components/PageHeader';
import { useToast } from '@/shared/components/Toast';
import DailyTab from '../components/DailyTab';
import EmployeeMonthDialog from '../components/EmployeeMonthDialog';
import LeaveDialog from '../components/LeaveDialog';
import LeavesTab from '../components/LeavesTab';
import MonthlyTab from '../components/MonthlyTab';
import { isoDate } from '../constants';
import { useAttendancePermissions } from '../permissions';
import { tr } from '@/i18n';

type TabKey = 'daily' | 'leaves' | 'monthly';

export default function AttendancePage() {
  const toast = useToast();
  const { canEdit, canApprove } = useAttendancePermissions();
  const [tab, setTab] = useState<TabKey>('daily');
  const [month, setMonth] = useState(isoDate().slice(0, 7));
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <>
      <PageHeader
        title={tr("Davomat")}
        subtitle={tr("Xodimlarning kelish-ketish vaqti, kechikishlar, kelmagan kunlar va javob so'rovlari")}
        action={
          canEdit && (
            <Button variant="contained" startIcon={<EventAvailableOutlinedIcon />} onClick={() => setLeaveOpen(true)}>
              {tr("Javob so'rovi")}
            </Button>
          )
        }
      />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          <Tab value="daily" label={tr("Kunlik davomat")} />
          <Tab
            value="leaves"
            label={
              <Badge color="secondary" badgeContent={pending} sx={{ '& .MuiBadge-badge': { right: -14, top: 2 } }}>
                {tr("Javob so'rovlari")}
              </Badge>
            }
            sx={{ pr: pending ? 4 : 2 }}
          />
          <Tab value="monthly" label={tr("Oylik hisobot")} />
        </Tabs>
      </Box>

      {tab === 'daily' && (
        <DailyTab canEdit={canEdit} canApprove={canApprove} onOpenEmployee={setEmployeeId} onLeaveChanged={refresh} refreshKey={refreshKey} />
      )}
      <Box sx={{ display: tab === 'leaves' ? 'block' : 'none' }}>
        <LeavesTab
          canEdit={canEdit}
          canApprove={canApprove}
          refreshKey={refreshKey}
          onChanged={refresh}
          onPendingCount={setPending}
          onOpenEmployee={setEmployeeId}
        />
      </Box>
      {tab === 'monthly' && <MonthlyTab month={month} onMonthChange={setMonth} onOpenEmployee={setEmployeeId} refreshKey={refreshKey} />}

      <EmployeeMonthDialog employeeId={employeeId} month={month} onClose={() => setEmployeeId(null)} />
      <LeaveDialog
        open={leaveOpen}
        canApprove={canApprove}
        onClose={() => setLeaveOpen(false)}
        onSaved={(msg) => {
          setLeaveOpen(false);
          toast.success(msg);
          refresh();
          setTab('leaves');
        }}
      />
    </>
  );
}
