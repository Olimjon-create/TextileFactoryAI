import { IconButton, Tooltip } from '@mui/material';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import { useToast } from '@/shared/components/Toast';
import { tr } from '@/i18n';

export default function ShareProductButton({ name, url }: { name: string; url: string }) {
  const toast = useToast();
  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: name, text: name, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(tr('Havola nusxalandi'));
    } catch {
      window.prompt(tr('Havolani nusxalang'), url);
    }
  };
  return (
    <Tooltip title={tr('Ulashish')}>
      <IconButton size="small" onClick={share} aria-label={tr('Ulashish')}>
        <ShareOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
