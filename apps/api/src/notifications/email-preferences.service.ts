import { db, Prisma } from '@db';
import { Injectable, NotFoundException } from '@nestjs/common';

export type EmailPreferencesPatch = Record<string, boolean | string>;

/** Personal email preferences, merged so a partial update never drops other keys. */
@Injectable()
export class EmailPreferencesService {
  async merge({
    where,
    patch,
  }: {
    where: { id: string } | { email: string };
    patch: EmailPreferencesPatch;
  }) {
    const user = await db.user.findUnique({
      where,
      select: { id: true, emailPreferences: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const current =
      user.emailPreferences &&
      typeof user.emailPreferences === 'object' &&
      !Array.isArray(user.emailPreferences)
        ? (user.emailPreferences as Record<string, unknown>)
        : {};
    const preferences = { ...current, ...patch };
    const toggles = Object.values(preferences).filter(
      (v) => typeof v === 'boolean',
    );
    const allOff = toggles.length > 0 && toggles.every((v) => v === false);

    await db.user.update({
      where: { id: user.id },
      data: {
        emailPreferences: preferences as Prisma.InputJsonValue,
        emailNotificationsUnsubscribed: allOff,
      },
    });
    return { success: true, preferences };
  }
}
