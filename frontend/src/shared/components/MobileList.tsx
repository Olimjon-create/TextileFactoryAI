import { Box, ButtonBase, Divider, Skeleton, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface ItemProps {
  title: ReactNode;

  overline?: ReactNode;
  subtitle?: ReactNode;

  trailing?: ReactNode;

  meta?: ReactNode;

  actions?: ReactNode;

  leading?: ReactNode;
  onClick?: () => void;
}

export function MobileListItem({
  title,
  overline,
  subtitle,
  trailing,
  meta,
  actions,
  leading,
  onClick,
}: ItemProps) {
  const content = (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        px: 2,
        py: 1.5,
        width: "100%",
        textAlign: "left",
        alignItems: "flex-start",
      }}
    >
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {overline && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: "monospace", display: "block" }}
          >
            {overline}
          </Typography>
        )}
        <Typography sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.25, wordBreak: "break-word" }}
          >
            {subtitle}
          </Typography>
        )}
        {meta && (
          <Box
            sx={{
              display: "flex",
              gap: 0.5,
              flexWrap: "wrap",
              alignItems: "center",
              mt: 1,
            }}
          >
            {meta}
          </Box>
        )}
      </Box>
      {trailing && (
        <Box sx={{ flexShrink: 0, textAlign: "right" }}>{trailing}</Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ position: "relative" }}>
      {onClick ? (
        <ButtonBase
          onClick={onClick}
          sx={{
            width: "100%",
            display: "block",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          {content}
        </ButtonBase>
      ) : (
        content
      )}
      {actions && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 0.5,
            px: 1,
            pb: 1,
            mt: -1,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </Box>
      )}
      <Divider />
    </Box>
  );
}

export function MobileListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i}>
          <Box sx={{ display: "flex", gap: 1.5, px: 2, py: 1.5 }}>
            <Box sx={{ flex: 1 }}>
              <Skeleton width="30%" height={16} />
              <Skeleton width="65%" height={24} />
              <Skeleton width="45%" />
            </Box>
            <Skeleton variant="rounded" width={64} height={24} />
          </Box>
          <Divider />
        </Box>
      ))}
    </>
  );
}

export function MobileListEmpty({ children }: { children: ReactNode }) {
  return (
    <Typography
      color="text.secondary"
      sx={{ textAlign: "center", py: 6, px: 2 }}
    >
      {children}
    </Typography>
  );
}
