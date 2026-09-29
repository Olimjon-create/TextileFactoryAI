import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, Box, Chip, Fab, IconButton, Paper, TextField, Tooltip, Typography, Zoom } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Link as RouterLink } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { storeApi } from '../api';
import type { StoreCatalogProduct } from '../types';
import StoreImage from './StoreImage';
import { tr } from '@/i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  products?: StoreCatalogProduct[];
  error?: boolean;
}

const STORAGE_KEY = 'tfai_assistant_chat';
const SUGGESTIONS = [
  tr('Qishga issiq kiyim bormi?'),
  tr('300 000 so\'mgacha futbolkalar'),
  tr("Qaysi zavodlarda jinsi bor?"),
  tr('Qanday buyurtma beraman?'),
];

function loadChat(): ChatMessage[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.slice(-30) : [];
  } catch {
    return [];
  }
}

function ProductChip({ p, onOpen }: { p: StoreCatalogProduct; onOpen: () => void }) {
  return (
    <Box
      component={RouterLink}
      to={`/store/factories/${p.factory_id}?product=${p.id}`}
      onClick={onOpen}
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        p: 0.75,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        color: 'inherit',
        textDecoration: 'none',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <StoreImage src={p.model_image_url ?? p.image_url} seed={p.name} alt="" sx={{ width: 44, height: 52, borderRadius: 1.5, flexShrink: 0 }} iconSize={20} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {p.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {p.factory_name} · {formatMoney(p.price)}
        </Typography>
      </Box>
    </Box>
  );
}

export default function AssistantWidget() {
  const isMobile = useIsMobile();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    storeApi.assistantStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      return;
    }
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  if (!enabled) return null;

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages.filter((m) => !m.error), { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await storeApi.assistant(next.slice(-12).map(({ role, content: c }) => ({ role, content: c })));
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, products: res.products }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: getErrorMessage(err, tr('Yordamchi javob bera olmadi')), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <>
      <Zoom in={!open}>
        <Fab
          variant="extended"
          color="primary"
          onClick={() => setOpen(true)}
          sx={{ position: 'fixed', zIndex: (t) => t.zIndex.drawer - 2, right: { xs: 16, md: 32 }, bottom: { xs: 88, md: 112 }, gap: 1 }}
        >
          <AutoAwesomeIcon fontSize="small" />
          {!isMobile && tr('AI yordamchi')}
        </Fab>
      </Zoom>
      {open && (
        <Paper
          elevation={12}
          role="dialog"
          aria-label={tr('AI yordamchi')}
          sx={(t) => ({
            position: 'fixed',
            zIndex: t.zIndex.drawer + 1,
            right: { xs: 0, sm: 24 },
            bottom: { xs: 0, sm: 24 },
            width: { xs: '100%', sm: 400 },
            height: { xs: '85dvh', sm: 580 },
            maxHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: { xs: '16px 16px 0 0', sm: '16px' },
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34 }}>
              <AutoAwesomeIcon fontSize="small" />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{tr('AI yordamchi')}</Typography>
              <Typography variant="caption" color="text.secondary">
                {tr('Katalog bo\'yicha savollarga javob beradi')}
              </Typography>
            </Box>
            {messages.length > 0 && (
              <Tooltip title={tr('Yangi suhbat')}>
                <IconButton size="small" onClick={() => setMessages([])} disabled={busy}>
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={() => setOpen(false)} aria-label={tr('Yopish')}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box ref={listRef} sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: 'background.default' }}>
            {messages.length === 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {tr("Salom! Mahsulot, o'lcham, narx yoki zavodlar haqida so'rang — katalogdan topib beraman.")}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {SUGGESTIONS.map((s) => (
                    <Chip key={s} label={s} variant="outlined" onClick={() => send(s)} sx={{ bgcolor: 'background.paper' }} />
                  ))}
                </Box>
              </Box>
            )}
            {messages.map((m, i) => (
              <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%' }}>
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    ...(m.role === 'user'
                      ? { bgcolor: 'primary.main', color: 'primary.contrastText', ml: 'auto', width: 'fit-content' }
                      : { bgcolor: 'background.paper', border: 1, borderColor: m.error ? 'error.main' : 'divider', color: m.error ? 'error.main' : 'text.primary' }),
                  }}
                >
                  <Typography variant="body2">{m.content}</Typography>
                </Box>
                {m.products && m.products.length > 0 && (
                  <Box sx={{ display: 'grid', gap: 0.75, mt: 0.75 }}>
                    {m.products.map((p) => (
                      <ProductChip key={p.id} p={p} onOpen={() => isMobile && setOpen(false)} />
                    ))}
                  </Box>
                )}
              </Box>
            ))}
            {busy && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {tr('Yozmoqda...')}
              </Typography>
            )}
          </Box>

          <Box component="form" onSubmit={submit} sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider', pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <TextField
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={tr('Savolingizni yozing...')}
              size="small"
              fullWidth
              autoFocus={!isMobile}
              inputProps={{ maxLength: 1000 }}
            />
            <IconButton type="submit" color="primary" disabled={busy || !input.trim()} aria-label={tr('Yuborish')}>
              <SendIcon />
            </IconButton>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', pb: 1, px: 2, fontSize: 11 }}>
            {tr("AI xato qilishi mumkin — narx va mavjudlikni mahsulot sahifasida tekshiring.")}
          </Typography>
        </Paper>
      )}
    </>
  );
}
