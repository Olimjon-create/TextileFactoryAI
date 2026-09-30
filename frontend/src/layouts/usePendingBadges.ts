import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { attendanceApi } from '@/features/attendance/api';
import { LEAVE_APPROVER_ROLES } from '@/features/attendance/permissions';
import { resourcesApi } from '@/features/resources/api';
import { WORKFORCE_EDITOR_ROLES } from '@/features/resources/permissions';

const POLL_MS = 60_000;

/** Sidebar nishonlari: Telegram'dan kelgan ishga qo'shilish va javob so'rovlari (ko'rib chiqilmaganlar). */
export function usePendingBadges() {
  const { user, hasRole } = useAuth();
  const canJoin = !!user && hasRole(...WORKFORCE_EDITOR_ROLES);
  const canLeaves = !!user && hasRole(...LEAVE_APPROVER_ROLES);
  const [joinRequests, setJoinRequests] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);

  const refresh = useCallback(() => {
    if (canJoin) resourcesApi.joinRequests().then((r) => setJoinRequests(r.length)).catch(() => undefined);
    if (canLeaves) attendanceApi.leaves({ status: 'PENDING', limit: 1 }).then((p) => setPendingLeaves(p.pending)).catch(() => undefined);
  }, [canJoin, canLeaves]);

  useEffect(() => {
    setJoinRequests(0);
    setPendingLeaves(0);
    if (!canJoin && !canLeaves) return;
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [canJoin, canLeaves, refresh]);

  return { joinRequests, pendingLeaves };
}
