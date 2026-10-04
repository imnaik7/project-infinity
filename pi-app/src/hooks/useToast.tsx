import { useCallback } from 'react';
import { Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';

export const TOASTER_ID = 'pin-toaster';

type Intent = 'success' | 'error' | 'warning' | 'info';

/** notify('Interview scheduled', 'Invite sent to …') — app-wide toast */
export function useToast() {
  const { dispatchToast } = useToastController(TOASTER_ID);
  return useCallback(
    (title: string, body?: string, intent: Intent = 'success') =>
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent, timeout: intent === 'error' ? 8000 : 4000 },
      ),
    [dispatchToast],
  );
}

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
