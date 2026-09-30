import type { ReactNode } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import QrCodeScannerOutlinedIcon from '@mui/icons-material/QrCodeScannerOutlined';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ViewTimelineOutlinedIcon from '@mui/icons-material/ViewTimelineOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import AllInboxOutlinedIcon from '@mui/icons-material/AllInboxOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { ATTENDANCE_VIEW_ROLES } from '@/features/attendance/permissions';
import { CUSTOMER_VIEW_ROLES } from '@/features/customers/permissions';
import { AUDIT_VIEW_ROLES, INVENTORY_EDITOR_ROLES, INVENTORY_VIEW_ROLES } from '@/features/inventory/permissions';
import { MACHINE_VIEW_ROLES, PAY_VIEW_ROLES, WORKFORCE_EDITOR_ROLES, WORKFORCE_VIEW_ROLES } from '@/features/resources/permissions';
import { KPI_VIEW_ROLES, PRODUCTION_VIEW_ROLES } from '@/features/production/permissions';
import { ORDER_VIEW_ROLES } from '@/features/orders/permissions';
import { PROCUREMENT_VIEW_ROLES } from '@/features/procurement/permissions';
import { LOGISTICS_VIEW_ROLES } from '@/features/logistics/permissions';
import { REPORT_VIEW_ROLES } from '@/features/analytics/permissions';
import { VISION_VIEW_ROLES } from '@/features/vision/permissions';
import { USER_MANAGER_ROLES } from '@/shared/constants/roles';
import type { Role } from '@/shared/types';
import { tr } from '@/i18n';

export interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  roles?: Role[];
  badge?: 'newOrders';
  external?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    title: tr("Asosiy"),
    items: [
      { label: tr("Dashboard"), path: '/', icon: <DashboardOutlinedIcon /> },
      { label: tr("Hisobotlar"), path: '/reports', icon: <AssessmentOutlinedIcon />, roles: REPORT_VIEW_ROLES },
      { label: tr("Foyda va xarajatlar"), path: '/finance', icon: <AccountBalanceWalletOutlinedIcon />, roles: PAY_VIEW_ROLES },
    ],
  },
  {
    title: tr("Boshqaruv"),
    items: [
      {
        label: tr("Fabrikalar"),
        path: '/factories',
        icon: <FactoryOutlinedIcon />,
        roles: ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER'],
      },
      {
        label: tr("Foydalanuvchilar"),
        path: '/users',
        icon: <PeopleAltOutlinedIcon />,
        roles: USER_MANAGER_ROLES,
      },
      { label: tr("Audit log"), path: '/audit', icon: <HistoryOutlinedIcon />, roles: AUDIT_VIEW_ROLES },
    ],
  },
  {
    title: tr("Ishlab chiqarish"),
    items: [
      { label: tr("Mahsulotlar va BOM"), path: '/products', icon: <CheckroomOutlinedIcon /> },
      { label: tr("Ish buyurtmalari"), path: '/production', icon: <AssignmentOutlinedIcon />, roles: PRODUCTION_VIEW_ROLES },
      { label: tr("Skaner (QR)"), path: '/production/scan', icon: <QrCodeScannerIcon />, roles: PRODUCTION_VIEW_ROLES },
      { label: tr("Xodimlar KPI"), path: '/production/kpi', icon: <InsightsOutlinedIcon />, roles: KPI_VIEW_ROLES },
      { label: tr("Kameralar va AI"), path: '/vision', icon: <VideocamOutlinedIcon />, roles: VISION_VIEW_ROLES },
    ],
  },
  {
    title: tr("Resurslar"),
    items: [
      { label: tr("Xodimlar"), path: '/employees', icon: <BadgeOutlinedIcon />, roles: WORKFORCE_VIEW_ROLES },
      { label: tr("Xodim qo'shish"), path: '/employees/new', icon: <PersonAddAlt1OutlinedIcon />, roles: WORKFORCE_EDITOR_ROLES },
      { label: tr("Davomat"), path: '/attendance', icon: <EventNoteOutlinedIcon />, roles: ATTENDANCE_VIEW_ROLES },
      { label: tr("Ish haqi"), path: '/payroll', icon: <PaymentsOutlinedIcon />, roles: PAY_VIEW_ROLES },
      { label: tr("Liniyalar va smenalar"), path: '/lines', icon: <ViewTimelineOutlinedIcon />, roles: WORKFORCE_VIEW_ROLES },
      { label: tr("Mashinalar"), path: '/machines', icon: <PrecisionManufacturingOutlinedIcon />, roles: MACHINE_VIEW_ROLES },
    ],
  },
  {
    title: tr("Ombor"),
    items: [
      { label: tr("Umumiy ko'rinish"), path: '/warehouse', icon: <SpaceDashboardOutlinedIcon />, roles: INVENTORY_VIEW_ROLES },
      { label: tr("Omborchi rejimi"), path: '/warehouse/mobile', icon: <QrCodeScannerOutlinedIcon />, roles: INVENTORY_EDITOR_ROLES },
      { label: tr("Materiallar"), path: '/inventory/materials', icon: <Inventory2OutlinedIcon />, roles: INVENTORY_VIEW_ROLES },
      { label: tr("Kirim-chiqim jurnali"), path: '/inventory/movements', icon: <SwapVertIcon />, roles: INVENTORY_VIEW_ROLES },
      { label: tr("Tayyor mahsulot"), path: '/finished-goods', icon: <AllInboxOutlinedIcon />, roles: LOGISTICS_VIEW_ROLES },
      { label: tr("Ombor joylari"), path: '/inventory/locations', icon: <WarehouseOutlinedIcon />, roles: INVENTORY_VIEW_ROLES },
      { label: tr("Ombor hisobotlari"), path: '/warehouse/reports', icon: <SummarizeOutlinedIcon />, roles: INVENTORY_VIEW_ROLES },
    ],
  },
  {
    title: tr("Ta'minot"),
    items: [
      { label: tr("Xarid buyurtmalari"), path: '/purchases', icon: <ShoppingCartOutlinedIcon />, roles: PROCUREMENT_VIEW_ROLES },
      { label: tr("Yetkazib beruvchilar"), path: '/suppliers', icon: <CorporateFareOutlinedIcon />, roles: PROCUREMENT_VIEW_ROLES },
    ],
  },
  {
    title: tr("Savdo"),
    items: [
      { label: tr("Buyurtmalar"), path: '/orders', icon: <ReceiptLongOutlinedIcon />, roles: ORDER_VIEW_ROLES, badge: 'newOrders' },
      { label: tr("Mijoz savollari"), path: '/questions', icon: <QuestionAnswerOutlinedIcon />, roles: ORDER_VIEW_ROLES },
      { label: tr("Jo'natmalar"), path: '/shipments', icon: <LocalShippingOutlinedIcon />, roles: LOGISTICS_VIEW_ROLES },
      { label: tr("Mijozlar"), path: '/customers', icon: <HandshakeOutlinedIcon />, roles: CUSTOMER_VIEW_ROLES },
      { label: tr("Mijozlar katalogi"), path: '/store', icon: <StorefrontOutlinedIcon />, external: true },
    ],
  },
];

export const BOTTOM_NAVIGATION: NavItem[] = [
  { label: tr("Sozlamalar"), path: '/settings', icon: <SettingsOutlinedIcon /> },
];
