import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { CUSTOMER_VIEW_ROLES } from '@/features/customers/permissions';
import { GuestRoute, ProtectedRoute, RoleGuard } from '@/features/auth/guards';
import { AUDIT_VIEW_ROLES, INVENTORY_VIEW_ROLES } from '@/features/inventory/permissions';
import { ORDER_VIEW_ROLES } from '@/features/orders/permissions';
import { MACHINE_VIEW_ROLES, WORKFORCE_VIEW_ROLES } from '@/features/resources/permissions';
import { ATTENDANCE_VIEW_ROLES } from '@/features/attendance/permissions';
import { KPI_VIEW_ROLES, PRODUCTION_VIEW_ROLES } from '@/features/production/permissions';
import { PROCUREMENT_VIEW_ROLES } from '@/features/procurement/permissions';
import { LOGISTICS_VIEW_ROLES } from '@/features/logistics/permissions';
import { REPORT_VIEW_ROLES } from '@/features/analytics/permissions';
import { VISION_VIEW_ROLES } from '@/features/vision/permissions';
import StoreLayout from '@/features/store/components/StoreLayout';
import AuthLayout from '@/layouts/AuthLayout';
import MainLayout from '@/layouts/MainLayout';
import { USER_MANAGER_ROLES } from '@/shared/constants/roles';
import NotFoundPage from '@/shared/pages/NotFoundPage';
import RouteErrorPage from '@/shared/pages/RouteErrorPage';

// Sahifalar alohida bo'laklarda yuklanadi (code splitting): sayt tezroq ochiladi,
// sahifa kodi yuklanayotganda layout ichidagi Suspense skeleton ko'rsatadi.
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const FactoriesPage = lazy(() => import('@/features/factories/pages/FactoriesPage'));
const UsersPage = lazy(() => import('@/features/users/pages/UsersPage'));
const ProductsPage = lazy(() => import('@/features/products/pages/ProductsPage'));
const ProductDetailPage = lazy(() => import('@/features/products/pages/ProductDetailPage'));
const CustomersPage = lazy(() => import('@/features/customers/pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/features/customers/pages/CustomerDetailPage'));
const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'));
const MaterialsPage = lazy(() => import('@/features/inventory/pages/MaterialsPage'));
const MaterialDetailPage = lazy(() => import('@/features/inventory/pages/MaterialDetailPage'));
const MovementsPage = lazy(() => import('@/features/inventory/pages/MovementsPage'));
const WarehouseOverviewPage = lazy(() => import('@/features/inventory/pages/WarehouseOverviewPage'));
const LocationsPage = lazy(() => import('@/features/inventory/pages/LocationsPage'));
const EmployeesPage = lazy(() => import('@/features/resources/pages/EmployeesPage'));
const AttendancePage = lazy(() => import('@/features/attendance/pages/AttendancePage'));
const LinesShiftsPage = lazy(() => import('@/features/resources/pages/LinesShiftsPage'));
const MachinesPage = lazy(() => import('@/features/resources/pages/MachinesPage'));
const MachineDetailPage = lazy(() => import('@/features/resources/pages/MachineDetailPage'));
const WorkOrdersPage = lazy(() => import('@/features/production/pages/WorkOrdersPage'));
const WorkOrderDetailPage = lazy(() => import('@/features/production/pages/WorkOrderDetailPage'));
const ScanPage = lazy(() => import('@/features/production/pages/ScanPage'));
const KpiPage = lazy(() => import('@/features/production/pages/KpiPage'));
const SuppliersPage = lazy(() => import('@/features/procurement/pages/SuppliersPage'));
const SupplierDetailPage = lazy(() => import('@/features/procurement/pages/SupplierDetailPage'));
const PurchaseOrdersPage = lazy(() => import('@/features/procurement/pages/PurchaseOrdersPage'));
const PurchaseOrderDetailPage = lazy(() => import('@/features/procurement/pages/PurchaseOrderDetailPage'));
const FinishedGoodsPage = lazy(() => import('@/features/logistics/pages/FinishedGoodsPage'));
const ShipmentsPage = lazy(() => import('@/features/logistics/pages/ShipmentsPage'));
const ShipmentDetailPage = lazy(() => import('@/features/logistics/pages/ShipmentDetailPage'));
const ReportsPage = lazy(() => import('@/features/analytics/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/features/analytics/pages/SettingsPage'));
const VisionPage = lazy(() => import('@/features/vision/pages/VisionPage'));
const AuditLogPage = lazy(() => import('@/features/audit/AuditLogPage'));
const StoreHomePage = lazy(() => import('@/features/store/pages/StoreHomePage'));
const StoreFactoryPage = lazy(() => import('@/features/store/pages/StoreFactoryPage'));
const StoreOrdersPage = lazy(() => import('@/features/store/pages/StoreOrdersPage'));

export const router = createBrowserRouter([
  // Mijozlar uchun ochiq katalog — login talab qilinmaydi
  {
    element: <StoreLayout />,
    // Sahifa kodi yuklanmasa (yangi versiya) yoki kutilmagan xato — tushunarli sahifa
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/store', element: <StoreHomePage /> },
      { path: '/store/factories/:id', element: <StoreFactoryPage /> },
      { path: '/store/orders', element: <StoreOrdersPage /> },
    ],
  },
  {
    element: <GuestRoute />,
    // Sahifa kodi yuklanmasa (yangi versiya) yoki kutilmagan xato — tushunarli sahifa
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    // Sahifa kodi yuklanmasa (yangi versiya) yoki kutilmagan xato — tushunarli sahifa
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          {
            element: <RoleGuard roles={['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER']} />,
            children: [{ path: '/factories', element: <FactoriesPage /> }],
          },
          {
            element: <RoleGuard roles={USER_MANAGER_ROLES} />,
            children: [{ path: '/users', element: <UsersPage /> }],
          },
          { path: '/products', element: <ProductsPage /> },
          { path: '/products/:id', element: <ProductDetailPage /> },
          {
            element: <RoleGuard roles={CUSTOMER_VIEW_ROLES} />,
            children: [
              { path: '/customers', element: <CustomersPage /> },
              { path: '/customers/:id', element: <CustomerDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={ORDER_VIEW_ROLES} />,
            children: [
              { path: '/orders', element: <OrdersPage /> },
              { path: '/orders/:id', element: <OrderDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={INVENTORY_VIEW_ROLES} />,
            children: [
              { path: '/warehouse', element: <WarehouseOverviewPage /> },
              { path: '/inventory/materials', element: <MaterialsPage /> },
              { path: '/inventory/materials/:id', element: <MaterialDetailPage /> },
              { path: '/inventory/movements', element: <MovementsPage /> },
              { path: '/inventory/locations', element: <LocationsPage /> },
            ],
          },
          {
            element: <RoleGuard roles={PROCUREMENT_VIEW_ROLES} />,
            children: [
              { path: '/suppliers', element: <SuppliersPage /> },
              { path: '/suppliers/:id', element: <SupplierDetailPage /> },
              { path: '/purchases', element: <PurchaseOrdersPage /> },
              { path: '/purchases/:id', element: <PurchaseOrderDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={VISION_VIEW_ROLES} />,
            children: [
              { path: '/vision', element: <VisionPage /> },
              { path: '/vision/events', element: <VisionPage /> },
              { path: '/vision/rules', element: <VisionPage /> },
            ],
          },
          {
            element: <RoleGuard roles={REPORT_VIEW_ROLES} />,
            children: [{ path: '/reports', element: <ReportsPage /> }],
          },
          // Sozlamalar — hamma uchun (profil); moliyaviy qism sahifa ichida rol bo'yicha
          { path: '/settings', element: <SettingsPage /> },
          {
            element: <RoleGuard roles={LOGISTICS_VIEW_ROLES} />,
            children: [
              { path: '/finished-goods', element: <FinishedGoodsPage /> },
              { path: '/shipments', element: <ShipmentsPage /> },
              { path: '/shipments/:id', element: <ShipmentDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={AUDIT_VIEW_ROLES} />,
            children: [{ path: '/audit', element: <AuditLogPage /> }],
          },
          {
            element: <RoleGuard roles={WORKFORCE_VIEW_ROLES} />,
            children: [
              { path: '/employees', element: <EmployeesPage /> },
              { path: '/lines', element: <LinesShiftsPage /> },
            ],
          },
          {
            element: <RoleGuard roles={ATTENDANCE_VIEW_ROLES} />,
            children: [{ path: '/attendance', element: <AttendancePage /> }],
          },
          {
            element: <RoleGuard roles={MACHINE_VIEW_ROLES} />,
            children: [
              { path: '/machines', element: <MachinesPage /> },
              { path: '/machines/:id', element: <MachineDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={PRODUCTION_VIEW_ROLES} />,
            children: [
              { path: '/production', element: <WorkOrdersPage /> },
              { path: '/production/scan', element: <ScanPage /> },
              { path: '/production/:id', element: <WorkOrderDetailPage /> },
            ],
          },
          {
            element: <RoleGuard roles={KPI_VIEW_ROLES} />,
            children: [{ path: '/production/kpi', element: <KpiPage /> }],
          },
          // Yangi modullar sahifalari shu yerga qo'shiladi
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
