import { toast } from 'sonner';

/**
 * #85: one ZIP with the offboarding register CSV and every leaver's checklist,
 * access removal and evidence. The API answers 404 when nobody has an offboard date.
 */
export async function exportOffboardingEvidence() {
  const response = await fetch('/api/offboarding-export?all=true', { credentials: 'include' });
  if (response.status === 404) {
    toast.info('Nobody has an offboard date yet, so there is nothing to export.');
    return;
  }
  if (!response.ok) {
    toast.error('Failed to export offboarding evidence');
    return;
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'offboarding-evidence.zip';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
