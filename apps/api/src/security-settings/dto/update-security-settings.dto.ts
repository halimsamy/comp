import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import {
  IDLE_TIMEOUT_OPTIONS,
  SIGN_IN_METHODS,
} from '../../auth/session-policy';

export class UpdateSecuritySettingsDto {
  @ApiPropertyOptional({
    description:
      'Idle session timeout in minutes. null turns it off. 15 meets PCI DSS 8.2.8.',
    enum: IDLE_TIMEOUT_OPTIONS,
    nullable: true,
    example: 15,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn([...IDLE_TIMEOUT_OPTIONS])
  sessionIdleTimeoutMinutes?: number | null;

  @ApiPropertyOptional({
    description:
      'Sign-in methods members may use. Empty array allows every method.',
    type: 'array',
    items: { type: 'string', enum: [...SIGN_IN_METHODS] },
    example: ['google', 'microsoft'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...SIGN_IN_METHODS], { each: true })
  allowedSignInMethods?: string[];
}
