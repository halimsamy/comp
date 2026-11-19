import { env } from '@/env.mjs';
import { toast } from 'sonner';

const API_URL = env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

/** #75: the employee's own certificate for their latest completed cycle. */
export async function downloadMyCertificate(moduleId: string) {
  const res = await fetch(`${API_URL}/v1/training/me/certificate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId }),
  });
  if (!res.ok) {
    toast.error('Could not create the certificate. Try again.');
    return;
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'training-certificate.pdf';
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
