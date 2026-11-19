import { env } from '@/env.mjs';
import { NextResponse } from 'next/server';

/**
 * Unsubscribe page (no session): forwards the token-signed preference change to
 * the API (`PATCH /v1/email/preferences`), which verifies the token and merges.
 */
export async function PUT(request: Request) {
  const body = await request.text();
  const baseUrl = env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
  try {
    const response = await fetch(`${baseUrl}/v1/email/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Could not update preferences' },
        { status: response.status },
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating unsubscribe preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update preferences' },
      { status: 500 },
    );
  }
}
