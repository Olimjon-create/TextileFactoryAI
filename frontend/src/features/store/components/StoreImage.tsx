import { useEffect, useState } from 'react';
import { Box, Skeleton, type SxProps, type Theme } from '@mui/material';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';

// Rasm yuklanmagan bo'lsa — nomdan barqaror rang tanlanadigan gradient o'rinbosar
const GRADIENTS = [
  ['#283593', '#5c6bc0'],
  ['#00695c', '#26a69a'],
  ['#6a1b9a', '#ab47bc'],
  ['#ad1457', '#ec407a'],
  ['#e65100', '#ffa726'],
  ['#1565c0', '#42a5f5'],
  ['#37474f', '#78909c'],
];

function gradientFor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[hash % GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

/** Rasm brauzerga to'liq yuklanganmi (yoki xato bilan tugadimi) */
function useImageLoaded(src: string | null): boolean {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    const done = () => !cancelled && setLoadedSrc(src);
    img.onload = done;
    img.onerror = done; // xato bo'lsa ham skeletonni to'xtatamiz
    img.src = src;
    if (img.complete) done();
    return () => {
      cancelled = true;
    };
  }, [src]);
  return !src || loadedSrc === src;
}

interface Props {
  src: string | null;
  seed: string;
  alt: string;
  sx?: SxProps<Theme>;
  iconSize?: number;
}

export default function StoreImage({ src, seed, alt, sx, iconSize = 48 }: Props) {
  const loaded = useImageLoaded(src);
  return (
    <Box
      role="img"
      aria-label={alt}
      aria-busy={!loaded}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: src ? (loaded ? `url(${src})` : 'none') : gradientFor(seed),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'grid',
        placeItems: 'center',
        color: 'rgba(255,255,255,0.55)',
        transition: 'background-image .2s ease',
        ...sx,
      }}
    >
      {!src && <CheckroomOutlinedIcon sx={{ fontSize: iconSize }} />}
      {/* Rasm yuklanayotganda — to'lqinli skeleton */}
      {!loaded && <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'none' }} />}
    </Box>
  );
}
