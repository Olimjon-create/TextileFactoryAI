import { Box } from "@mui/material";
import type { ReactNode } from "react";

export default function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        p: 2,
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "center",
        [theme.breakpoints.down("md")]: {
          gap: 1.5,
          "& > *": {
            flex: "1 1 calc(50% - 12px)",
            minWidth: 0,
            maxWidth: "none !important",
            width: "auto !important",
          },
          "& > :first-of-type": { flexBasis: "100%" },
        },
      })}
    >
      {children}
    </Box>
  );
}
