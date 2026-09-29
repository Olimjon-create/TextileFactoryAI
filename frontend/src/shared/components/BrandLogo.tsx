import { Box, type SxProps, type Theme } from "@mui/material";

interface Props {
  size?: number;

  color?: string;
  radius?: number | string;
  sx?: SxProps<Theme>;
}

export default function BrandLogo({
  size = 40,
  color = "primary.main",
  radius = "28%",
  sx,
}: Props) {
  return (
    <Box
      aria-hidden
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: radius,
          bgcolor: color,
          color,
          display: "grid",
          placeItems: "center",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <svg viewBox="0 0 24 24" width="72%" height="72%" fill="none">
        <rect x="3.5" y="3.2" width="12" height="2.6" rx="1.2" fill="#fff" />
        <rect x="3.5" y="18.2" width="12" height="2.6" rx="1.2" fill="#fff" />

        <rect
          x="5.5"
          y="5.8"
          width="8"
          height="12.4"
          fill="#fff"
          fillOpacity="0.88"
        />
        <path
          d="M5.5 8.4l8 2.1M5.5 11.4l8 2.1M5.5 14.4l8 2.1"
          stroke="currentColor"
          strokeWidth="0.95"
          strokeOpacity="0.55"
        />

        <path
          d="M13.5 8.6c3.4.3 5.4 2.6 4.6 6.4"
          stroke="#fff"
          strokeWidth="1"
          strokeLinecap="round"
        />

        <path
          d="M20.6 3.4 17.5 20.4"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <ellipse
          cx="20.25"
          cy="5.4"
          rx="0.42"
          ry="1.05"
          transform="rotate(10 20.25 5.4)"
          fill="currentColor"
        />
      </svg>
    </Box>
  );
}
