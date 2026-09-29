import { useEffect, useRef, useState } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { authApi } from '../api';
import { tr } from '@/i18n';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
  cancel(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error(tr("Google skriptini yuklab bo'lmadi")));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function disableGoogleAutoSelect() {
  window.google?.accounts?.id?.disableAutoSelect();
}

interface Props {
  onCredential: (credential: string) => void;
  autoPrompt?: boolean;
}

export default function GoogleSignInButton({ onCredential, autoPrompt = true }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [clientId, setClientId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    authApi
      .config()
      .then((cfg) => setClientId(cfg.google_client_id))
      .catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        const gsi = window.google?.accounts.id;
        if (cancelled || !gsi || !buttonRef.current) return;
        gsi.initialize({
          client_id: clientId,
          callback: (res) => callbackRef.current(res.credential),
          auto_select: autoPrompt,
          cancel_on_tap_outside: false,
          use_fedcm_for_prompt: true,
        });
        gsi.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          locale: 'uz',
          width: Math.min(buttonRef.current.offsetWidth || 360, 400),
        });
        if (autoPrompt) gsi.prompt();
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      window.google?.accounts.id.cancel();
    };
  }, [clientId, autoPrompt]);

  if (!clientId) return null;

  return (
    <Box>
      <Divider sx={{ my: 2.5 }}>
        <Typography variant="body2" color="text.secondary">
          {tr("yoki")}
        </Typography>
      </Divider>
      <Box ref={buttonRef} sx={{ width: '100%', minHeight: 44, display: 'flex', justifyContent: 'center' }} />
      {failed && (
        <Typography variant="body2" color="error" sx={{ mt: 1, textAlign: 'center' }}>
          {tr("Google xizmatiga ulanib bo'lmadi. Internet aloqasini tekshiring.")}
        </Typography>
      )}
    </Box>
  );
}
