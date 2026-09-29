import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { api, getErrorMessage } from "@/shared/api/client";
import { tr } from '@/i18n';

const MAX_MB = 5;
const ACCEPT = "image/jpeg,image/png,image/webp";

interface Props {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  aspectRatio?: number;
  width?: number | string;
  hint?: string;
}

export default function ImageUpload({
  label,
  value,
  onChange,
  aspectRatio = 1,
  width = 160,
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(tr("Rasm hajmi {0} MB dan oshmasin", MAX_MB));
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const { data } = await api.post<{ url: string }>("/uploads/images", form);
      onChange(data.url);
    } catch (e) {
      setError(getErrorMessage(e, tr("Rasmni yuklab bo'lmadi")));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
        {label}
      </Typography>
      <Box
        onClick={() => !uploading && inputRef.current?.click()}
        sx={{
          position: "relative",
          width,
          aspectRatio: String(aspectRatio),
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: "action.hover",
          backgroundImage: value ? `url(${value})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "grid",
          placeItems: "center",
          cursor: uploading ? "wait" : "pointer",
          overflow: "hidden",
          "&:hover .overlay": { opacity: 1 },
        }}
      >
        {uploading ? (
          <CircularProgress size={28} />
        ) : !value ? (
          <Box sx={{ textAlign: "center", color: "text.secondary", p: 1 }}>
            <AddPhotoAlternateOutlinedIcon />
            <Typography variant="caption" display="block">
              {tr("Rasm tanlash")}
            </Typography>
          </Box>
        ) : (
          <Box
            className="overlay"
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: "rgba(0,0,0,0.45)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              opacity: 0,
              transition: "opacity .15s",
            }}
          >
            <Typography variant="caption">{tr("Almashtirish")}</Typography>
          </Box>
        )}
        {value && !uploading && (
          <Tooltip title={tr("Olib tashlash")}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              sx={{
                position: "absolute",
                top: 4,
                right: 4,
                bgcolor: "background.paper",
                opacity: 0.92,
                "&:hover": { bgcolor: "background.paper", opacity: 1 },
              }}
            >
              <DeleteOutlineIcon fontSize="small" color="error" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {hint && !error && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mt: 0.5 }}
        >
          {hint}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1, py: 0 }}>
          {error}
        </Alert>
      )}
      {!value && !uploading && (
        <Button
          size="small"
          sx={{ mt: 0.5, px: 0 }}
          onClick={() => inputRef.current?.click()}
        >
          {tr("Yuklash")}
        </Button>
      )}
    </Box>
  );
}
