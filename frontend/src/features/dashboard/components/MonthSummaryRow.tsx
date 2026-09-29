import { useEffect, useState } from 'react';
import { Box, CardActionArea } from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { financeApi, type ProfitLoss } from '@/features/finance/api';
import { ORDER_VIEW_ROLES } from '@/features/orders/permissions';
import { payrollApi, type PayrollReport } from '@/features/payroll/api';
import { questionsApi } from '@/features/questions/api';
import { PAY_VIEW_ROLES } from '@/features/resources/permissions';
import StatCard from '@/shared/components/StatCard';
import { formatMoneyShort } from '@/shared/utils/money';
import { tr } from '@/i18n';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function MonthSummaryRow() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const canPay = hasRole(...PAY_VIEW_ROLES);
  const canOrders = hasRole(...ORDER_VIEW_ROLES);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [pay, setPay] = useState<PayrollReport | null>(null);
  const [questions, setQuestions] = useState<number | null>(null);

  useEffect(() => {
    const month = thisMonth();
    if (canPay) {
      financeApi.profitLoss(month).then(setPl).catch(() => undefined);
      payrollApi.report(month).then(setPay).catch(() => undefined);
    }
    if (canOrders) questionsApi.list({ status: 'NEW', limit: 1 }).then((r) => setQuestions(r.new_count)).catch(() => undefined);
  }, [canPay, canOrders]);

  if (!canPay && !canOrders) return null;

  const tiles = [
    canPay && {
      key: 'profit',
      to: '/finance',
      node: (
        <StatCard
          label={tr('Shu oy sof foyda')}
          value={pl ? formatMoneyShort(pl.profit) : '…'}
          icon={<AccountBalanceWalletOutlinedIcon />}
          color={pl && pl.profit < 0 ? 'error.main' : 'success.main'}
          hint={pl ? tr('Tushum {0} · xarajat {1}', formatMoneyShort(pl.revenue), formatMoneyShort(pl.total_costs)) : undefined}
        />
      ),
    },
    canPay && {
      key: 'payroll',
      to: '/payroll',
      node: (
        <StatCard
          label={tr("To'lanmagan ish haqi")}
          value={pay ? formatMoneyShort(pay.totals.unpaid) : '…'}
          icon={<PaymentsOutlinedIcon />}
          color="warning.main"
          hint={pay ? tr("{0} xodim · to'langan {1}", pay.totals.employees, formatMoneyShort(pay.totals.paid)) : undefined}
        />
      ),
    },
    canOrders && {
      key: 'questions',
      to: '/questions',
      node: (
        <StatCard
          label={tr('Javob kutayotgan savollar')}
          value={questions ?? '…'}
          icon={<QuestionAnswerOutlinedIcon />}
          color={questions ? 'info.main' : 'text.secondary'}
          hint={tr("Katalogdagi «Savol berish» orqali")}
        />
      ),
    },
  ].filter(Boolean) as { key: string; to: string; node: JSX.Element }[];

  return (
    <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, mb: { xs: 2, sm: 2.5 }, gridTemplateColumns: { xs: '1fr', sm: `repeat(${Math.min(tiles.length, 3)}, minmax(0, 1fr))` } }}>
      {tiles.map((t) => (
        <CardActionArea key={t.key} onClick={() => navigate(t.to)} sx={{ borderRadius: 4, '& > *': { height: '100%' } }}>
          {t.node}
        </CardActionArea>
      ))}
    </Box>
  );
}
