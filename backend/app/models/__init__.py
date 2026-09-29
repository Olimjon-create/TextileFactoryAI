# Barcha modellar shu yerda import qilinadi, shunda Base.metadata ularni ko'radi.
# Yangi modul (warehouse, production, ...) qo'shilganda modelini shu yerga qo'shing
# va migrations/versions ichida yangi Alembic migratsiyasini yarating.
from app.models.attendance import Attendance, AttendanceStatus, LeaveRequest, LeaveStatus, LeaveType
from app.models.analytics import FactorySettings, NotificationRead
from app.models.audit import AuditLog
from app.models.password_reset import PasswordResetToken
from app.models.rate_limit import RateLimitHit
from app.models.customer import Customer
from app.models.factory import Factory
from app.models.inventory import Material, MovementType, StockMovement, WarehouseLocation
from app.models.logistics import ProductMovementType, ProductStockMovement, Shipment, ShipmentItem, ShipmentStatus
from app.models.order import Order, OrderItem
from app.models.procurement import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, Supplier
from app.models.product import BOMItem, Product
from app.models.production import ProductionLog, TrackingUnit, WorkOrder
from app.models.resources import (
    Employee,
    Machine,
    MachineMaintenance,
    MachineStatusLog,
    ProductionLine,
    Shift,
)
from app.models.user import User
from app.models.vision import Device, DeviceEvent, VisionRule

__all__ = [
    "Attendance",
    "AttendanceStatus",
    "LeaveRequest",
    "LeaveStatus",
    "LeaveType",
    "AuditLog",
    "BOMItem",
    "Customer",
    "Device",
    "DeviceEvent",
    "Employee",
    "Factory",
    "FactorySettings",
    "Machine",
    "MachineMaintenance",
    "MachineStatusLog",
    "Material",
    "MovementType",
    "NotificationRead",
    "Order",
    "OrderItem",
    "Product",
    "ProductMovementType",
    "ProductStockMovement",
    "ProductionLine",
    "ProductionLog",
    "PurchaseOrder",
    "PurchaseOrderItem",
    "PurchaseStatus",
    "PasswordResetToken",
    "RateLimitHit",
    "Shift",
    "Shipment",
    "ShipmentItem",
    "ShipmentStatus",
    "StockMovement",
    "Supplier",
    "TrackingUnit",
    "User",
    "VisionRule",
    "WarehouseLocation",
    "WorkOrder",
]
