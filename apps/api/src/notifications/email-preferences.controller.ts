import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { generateUnsubscribeToken } from '@trycompai/email';
import { timingSafeEqual } from 'node:crypto';
import { AuthContext } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import type { AuthContext as AuthContextType } from '../auth/types';
import {
  PatchEmailPreferencesByTokenDto,
  PatchEmailPreferencesDto,
} from './dto/patch-email-preferences.dto';
import { EmailPreferencesService } from './email-preferences.service';

/** Self-endpoint: the caller's own preferences, so a session is the only check (no RBAC). */
@ApiTags('People')
@Controller({ path: 'people/me/email-preferences', version: '1' })
@UseGuards(HybridAuthGuard)
@ApiSecurity('apikey')
export class MyEmailPreferencesController {
  constructor(private readonly preferences: EmailPreferencesService) {}

  @Patch()
  @ApiOperation({
    summary: 'Change some of my email preferences',
    description:
      'Merges the sent keys into the current user email preferences (unsent keys keep their value). Includes the compliance digest, ownership assignment and SLA alert emails.',
  })
  @ApiBody({ type: PatchEmailPreferencesDto })
  async patch(
    @AuthContext() authContext: AuthContextType,
    @Body() body: PatchEmailPreferencesDto,
  ) {
    if (!authContext.userId) {
      throw new BadRequestException(
        'User ID is required. This endpoint requires session authentication.',
      );
    }
    return this.preferences.merge({
      where: { id: authContext.userId },
      patch: { ...body.preferences },
    });
  }
}

/** Unsubscribe page: no session, the HMAC token in the email link proves the address. */
@ApiTags('Email - Unsubscribe')
@Controller({ path: 'email/preferences', version: '1' })
export class EmailPreferencesByTokenController {
  constructor(private readonly preferences: EmailPreferencesService) {}

  @Patch()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change email preferences from an unsubscribe link',
  })
  @ApiBody({ type: PatchEmailPreferencesByTokenDto })
  async patch(@Body() body: PatchEmailPreferencesByTokenDto) {
    const expected = generateUnsubscribeToken(body.email);
    const valid =
      expected.length === body.token.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(body.token));
    if (!valid) throw new BadRequestException('Invalid token');
    return this.preferences.merge({
      where: { email: body.email },
      patch: { ...body.preferences },
    });
  }
}
