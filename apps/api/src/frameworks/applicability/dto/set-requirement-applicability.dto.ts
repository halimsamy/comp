import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const APPLICABILITY_STATUSES = [
  'applicable',
  'not_applicable',
  'compensating_control',
  'customized_approach',
] as const;

export class SetRequirementApplicabilityDto {
  @ApiProperty({
    description:
      'applicable, not_applicable, or for PCI DSS compensating_control / customized_approach',
    enum: APPLICABILITY_STATUSES,
    example: 'not_applicable',
  })
  @IsIn(APPLICABILITY_STATUSES)
  status!: (typeof APPLICABILITY_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Why the requirement is excluded or met another way. Required unless applicable.',
    example: 'No wireless networks connect to the CDE.',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  justification?: string;
}
