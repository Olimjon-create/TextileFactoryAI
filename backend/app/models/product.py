import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.factory import Factory
    from app.models.inventory import Material


class ProductStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class ProductionUnit(str, enum.Enum):
    PIECE = "PIECE"
    PAIR = "PAIR"
    SET = "SET"
    DOZEN = "DOZEN"


class MaterialType(str, enum.Enum):
    FABRIC = "FABRIC"
    THREAD = "THREAD"
    BUTTON = "BUTTON"
    ZIPPER = "ZIPPER"
    LABEL = "LABEL"
    ELASTIC = "ELASTIC"
    INTERLINING = "INTERLINING"
    PACKAGING = "PACKAGING"
    ACCESSORY = "ACCESSORY"
    OTHER = "OTHER"


class MaterialUnit(str, enum.Enum):
    METER = "METER"
    CENTIMETER = "CENTIMETER"
    SQUARE_METER = "SQUARE_METER"
    KILOGRAM = "KILOGRAM"
    GRAM = "GRAM"
    PIECE = "PIECE"
    PAIR = "PAIR"
    SPOOL = "SPOOL"


class Product(Base, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_products_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(
        ForeignKey("factories.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), index=True)
    code: Mapped[str] = mapped_column(String(50), index=True)
    category: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    sizes: Mapped[list[str]] = mapped_column(JSON, default=list)
    colors: Mapped[list[str]] = mapped_column(JSON, default=list)
    unit: Mapped[ProductionUnit] = mapped_column(
        Enum(ProductionUnit, name="production_unit"), default=ProductionUnit.PIECE
    )
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus, name="product_status"), default=ProductStatus.DRAFT, index=True
    )
    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    image_url: Mapped[str | None] = mapped_column(String(500))
    model_image_url: Mapped[str | None] = mapped_column(String(500))

    factory: Mapped["Factory"] = relationship()
    bom_items: Mapped[list["BOMItem"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="BOMItem.id",
    )


class BOMItem(Base, TimestampMixin):
    """Mahsulotning bir birligi uchun kerak bo'ladigan material (Bill of Materials qatori).

    material_id — ombordagi materiallar katalogiga bog'lanish (ixtiyoriy). Bog'langan bo'lsa
    buyurtma bo'yicha material ehtiyoji va ombor qoldig'i avtomatik hisoblanadi; nom/tur/birlik
    esa tarix va eski yozuvlar uchun matn sifatida ham saqlanadi.
    """

    __tablename__ = "bom_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("materials.id", ondelete="SET NULL"), index=True
    )
    material_type: Mapped[MaterialType] = mapped_column(Enum(MaterialType, name="material_type"))
    material_name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    unit: Mapped[MaterialUnit] = mapped_column(Enum(MaterialUnit, name="material_unit"))
    waste_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    notes: Mapped[str | None] = mapped_column(String(500))

    product: Mapped[Product] = relationship(back_populates="bom_items")
    material: Mapped["Material | None"] = relationship(lazy="joined")

    @property
    def material_code(self) -> str | None:
        return self.material.code if self.material else None
