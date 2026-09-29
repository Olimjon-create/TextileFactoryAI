import { keyframes } from '@emotion/react';
import { Box, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { tr } from '@/i18n';

const BACKGROUND = '/brand/bg-knitwear.jpg';

const PERIOD = 1440;
const HEIGHT = 320;

function wavePath({ base, amp, waves, phase = 0, closed = true }: { base: number; amp: number; waves: number; phase?: number; closed?: boolean }) {
  const pts: string[] = [];
  for (let x = 0; x <= PERIOD * 2; x += 24) {
    const y = base + Math.sin((x / PERIOD) * Math.PI * 2 * waves + phase) * amp + Math.sin((x / PERIOD) * Math.PI * 2 * waves * 2 + phase * 1.7) * amp * 0.25;
    pts.push(`${x} ${y.toFixed(1)}`);
  }
  const line = `M${pts.join(' L')}`;
  return closed ? tr("{0} L{1} {2} L0 {3} Z", line, PERIOD * 2, HEIGHT, HEIGHT) : line;
}

const WAVES = {
  back: wavePath({ base: 120, amp: 34, waves: 1 }),
  middle: wavePath({ base: 165, amp: 26, waves: 2, phase: 1.2 }),
  front: wavePath({ base: 215, amp: 20, waves: 1, phase: 2.6 }),
  silkA: wavePath({ base: 160, amp: 60, waves: 1, phase: 0.4, closed: false }),
  silkB: wavePath({ base: 150, amp: 48, waves: 1, phase: 2.2, closed: false }),
};

const drift = keyframes`from { transform: translateX(0); } to { transform: translateX(-50%); }`;
const driftReverse = keyframes`from { transform: translateX(-50%); } to { transform: translateX(0); }`;
const bob = keyframes`0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); }`;
const glow = keyframes`0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(40px, 30px) scale(1.08); }`;

function WaveLayer({
  d,
  fill,
  stroke,
  duration,
  bobDuration,
  reverse = false,
  sx,
}: {
  d: string;
  fill?: string;
  stroke?: string;
  duration: number;
  bobDuration: number;
  reverse?: boolean;
  sx: object;
}) {
  return (
    <Box sx={{ position: 'absolute', left: 0, right: 0, animation: `${bob} ${bobDuration}s ease-in-out infinite`, ...sx }}>
      <Box
        component="svg"
        viewBox={`0 0 ${PERIOD * 2} ${HEIGHT}`}
        preserveAspectRatio="none"
        sx={{
          display: 'block',
          width: '200%',
          height: '100%',
          willChange: 'transform',
          animation: `${reverse ? driftReverse : drift} ${duration}s linear infinite`,
        }}
      >
        <path d={d} fill={fill ?? 'none'} stroke={stroke} strokeWidth={stroke ? 1.5 : undefined} vectorEffect="non-scaling-stroke" />
      </Box>
    </Box>
  );
}

export default function StoreBackdrop() {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const base = theme.palette.background.default;
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        bgcolor: base,
        '@media (prefers-reduced-motion: reduce)': { '& *': { animation: 'none !important' } },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: '-60px',
          backgroundImage: `url(${BACKGROUND})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: `blur(${dark ? 20 : 18}px) saturate(${dark ? 0.9 : 1.2})`,
          transform: 'scale(1.08)',
          opacity: dark ? 0.6 : 0.95,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${alpha(base, dark ? 0.5 : 0.22)} 0%, ${alpha(base, dark ? 0.72 : 0.55)} 50%, ${alpha(base, dark ? 0.88 : 0.8)} 100%)`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 640,
          height: 640,
          left: -200,
          top: -220,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(primary, dark ? 0.22 : 0.28)} 0%, transparent 70%)`,
          animation: `${glow} 18s ease-in-out infinite`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 560,
          height: 560,
          right: -180,
          bottom: -200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(secondary, dark ? 0.16 : 0.2)} 0%, transparent 70%)`,
          animation: `${glow} 22s ease-in-out infinite reverse`,
        }}
      />

      <WaveLayer d={WAVES.silkA} stroke={alpha(primary, dark ? 0.35 : 0.45)} duration={40} bobDuration={11} sx={{ top: '26%', height: { xs: 160, md: 220 } }} />
      <WaveLayer d={WAVES.silkB} stroke={alpha(secondary, dark ? 0.3 : 0.4)} duration={52} bobDuration={14} reverse sx={{ top: '30%', height: { xs: 160, md: 220 } }} />

      <WaveLayer d={WAVES.back} fill={alpha(primary, dark ? 0.16 : 0.2)} duration={34} bobDuration={9} sx={{ bottom: -10, height: { xs: '30vh', md: '38vh' } }} />
      <WaveLayer d={WAVES.middle} fill={alpha(secondary, dark ? 0.14 : 0.18)} duration={24} bobDuration={7} reverse sx={{ bottom: -10, height: { xs: '26vh', md: '32vh' } }} />
      <WaveLayer d={WAVES.front} fill={alpha(base, dark ? 0.55 : 0.6)} duration={18} bobDuration={8} sx={{ bottom: -10, height: { xs: '22vh', md: '26vh' } }} />
    </Box>
  );
}
