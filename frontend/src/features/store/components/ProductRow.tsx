import { useState } from 'react';
import { Box, Card, Chip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { PRODUCTION_UNIT_LABELS } from '@/features/products/constants';
import { colorSwatch } from '@/shared/utils/colors';
import { formatMoney } from '@/shared/utils/money';
import { useCart, variantLabel, type Variant } from '../CartContext';
import type { StoreProduct } from '../types';
import ProductGallery from './ProductGallery';
import ShareProductButton from './ShareProductButton';
import StockBadge from './StockBadge';
import QuantityStepper from './QuantityStepper';
import { tr } from '@/i18n';

interface Props {
  product: StoreProduct;
  onChange: (variant: Variant, quantity: number) => void;
  highlighted?: boolean;
}

function OptionGroup({
  label,
  options,
  value,
  onSelect,
  error,
  swatches,
}: {
  label: string;
  options: string[];
  value: string | null;
  onSelect: (v: string) => void;
  error: boolean;
  swatches?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
      <Typography variant="body2" sx={{ minWidth: 62, color: error ? 'error.main' : 'text.secondary', fontWeight: error ? 600 : 400 }}>
        {label}:
      </Typography>
      {options.map((o) => {
        const selected = value === o;
        const swatch = swatches ? colorSwatch(o) : null;
        return (
          <Chip
            key={o}
            label={o}
            size="small"
            clickable
            onClick={() => onSelect(o)}
            color={selected ? 'primary' : 'default'}
            variant={selected ? 'filled' : 'outlined'}
            aria-pressed={selected}
            icon={
              swatch ? (
                <Box
                  component="span"
                  sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: swatch, border: '1px solid rgba(0,0,0,0.25)', ml: '6px !important' }}
                />
              ) : undefined
            }
            sx={{ fontWeight: selected ? 600 : 400, borderColor: error && !selected ? 'error.light' : undefined }}
          />
        );
      })}
    </Box>
  );
}

export default function ProductRow({ product, onChange, highlighted = false }: Props) {
  const cart = useCart();
  const unit = PRODUCTION_UNIT_LABELS[product.unit].toLowerCase();
  const hasSizes = product.sizes.length > 0;
  const hasColors = product.colors.length > 0;

  const [size, setSize] = useState<string | null>(product.sizes.length === 1 ? product.sizes[0] : null);
  const [color, setColor] = useState<string | null>(product.colors.length === 1 ? product.colors[0] : null);
  const [showError, setShowError] = useState(false);

  const variant: Variant = { size: hasSizes ? size : null, color: hasColors ? color : null };
  const complete = (!hasSizes || size !== null) && (!hasColors || color !== null);
  const quantity = complete ? cart.quantityOf(product.id, variant) : 0;
  const inCart = cart.linesOf(product.id);

  const handleChange = (q: number) => {
    if (!complete) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onChange(variant, q);
  };

  const missing = [hasSizes && size === null && tr("o'lcham"), hasColors && color === null && 'rang'].filter(Boolean).join(' va ');

  return (
    <Card
      sx={(theme) => ({
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        overflow: 'hidden',
        position: 'relative',
        transition: 'transform 0.5s cubic-bezier(.2,.7,.2,1), box-shadow 0.5s ease, border-color 0.35s ease',
        '& .pg-photo > *': { transition: 'transform 0.6s ease' },
        '@media (hover: hover) and (pointer: fine)': {
          '&:hover .pg-photo > *': { transform: 'scale(1.06)' },
        },
        ...(highlighted && {
          zIndex: 1,
          transform: { xs: 'scale(1.02)', sm: 'scale(1.035)' },
          boxShadow: `0 0 0 2px ${theme.palette.primary.main}, 0 24px 60px ${alpha(theme.palette.primary.main, 0.35)}`,
          '&&:hover': { transform: 'scale(1.035)' },
        }),
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          transform: 'none',
          '& .pg-photo > *': { transition: 'none', transform: 'none !important' },
        },
      })}
    >
      <ProductGallery product={product} />
      <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'center' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {product.category} · {product.code}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="h6" sx={{ fontSize: 18, flex: 1, minWidth: 0 }}>
              {product.name}
            </Typography>
            <ShareProductButton name={product.name} url={`${window.location.origin}${window.location.pathname}?product=${product.id}`} />
          </Box>
          <StockBadge inStock={product.in_stock} />
          {product.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {product.description}
            </Typography>
          )}
          {hasSizes && (
            <OptionGroup
              label={tr("O'lcham")}
              options={product.sizes}
              value={size}
              onSelect={(v) => {
                setSize(v);
                setShowError(false);
              }}
              error={showError && size === null}
            />
          )}
          {hasColors && (
            <OptionGroup
              label={tr("Rang")}
              options={product.colors}
              value={color}
              onSelect={(v) => {
                setColor(v);
                setShowError(false);
              }}
              error={showError && color === null}
              swatches
            />
          )}
          {showError && missing && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.75 }}>
              {tr("Avval")}{' '}{missing}{tr("ni tanlang")}
            </Typography>
          )}
          {inCart.length > 0 && (hasSizes || hasColors) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 62 }}>
                {tr("Savatda:")}
              </Typography>
              {inCart.map((l) => (
                <Chip
                  key={l.key}
                  size="small"
                  color="success"
                  variant="outlined"
                  label={`${variantLabel(l)} × ${l.quantity}`}
                  onClick={() => {
                    setSize(l.size);
                    setColor(l.color);
                    setShowError(false);
                  }}
                  onDelete={() => cart.removeLine(l.key)}
                />
              ))}
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between', flexShrink: 0 }}>
          <Box sx={{ textAlign: { md: 'right' } }}>
            <Typography variant="h6" color="primary.main" sx={{ whiteSpace: 'nowrap' }}>
              {formatMoney(product.price)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              1 {unit} {tr("uchun")}
            </Typography>
          </Box>
          <QuantityStepper value={quantity} onChange={handleChange} />
        </Box>
      </Box>
    </Card>
  );
}
