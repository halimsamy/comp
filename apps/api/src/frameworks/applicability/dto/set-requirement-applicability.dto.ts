import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Structured worksheet. compensating_control: { kind, constraints, objective, identifiedRisk, compensatingControlIds[], validation, maintenance, revalidateAt (YYYY-MM-DD) } (PCI Appendix C). customized_approach: { kind, objective, matrix: [{ control, howMeetsObjective }], targetedRiskAnalysisSubmissionId } (PCI Appendix E). Ignored for applicable.',
    type: 'object',
    additionalProperties: true,
    example: {
      kind: 'compensating_control',
      constraints: 'Legacy HSM cannot rotate keys automatically.',
      objective: 'Keys are rotated at the end of their cryptoperiod.',
      identifiedRisk: 'Stale keys widen the exposure window.',
      compensatingControlIds: ['ctl_abc123'],
      validation: 'Quarterly key ceremony log reviewed by the CISO.',
      maintenance: 'Ceremony scheduled in the compliance calendar.',
      revalidateAt: '2027-11-18',
    },
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Not applicable only: also mark every sub-requirement (identifier prefix, e.g. 1.2 -> 1.2.1, 1.2.2) not applicable with the same justification.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  applyToChildren?: boolean;
}
