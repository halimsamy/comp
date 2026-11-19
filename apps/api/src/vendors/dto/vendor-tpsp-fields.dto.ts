import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { VendorAssuranceType, VendorCriticality, VendorPciStatus } from '@db';

export const VENDOR_DATA_TYPES = [
  'cardholder_data',
  'sensitive_authentication_data',
  'customer_pii',
  'employee_pii',
  'financial',
  'credentials',
  'source_code',
  'health',
  'confidential_business',
  'public',
] as const;

export const RESPONSIBILITY_OWNERS = ['tpsp', 'entity', 'shared'] as const;

/** One row of the PCI DSS 12.8.5 responsibility matrix. */
export class ResponsibilityMatrixRowDto {
  @ApiPropertyOptional({
    description: 'PCI DSS requirement or area',
    example: '8.4 MFA for CDE access',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  requirement!: string;

  @ApiPropertyOptional({
    description: 'Who manages the requirement',
    enum: RESPONSIBILITY_OWNERS,
  })
  @IsIn(RESPONSIBILITY_OWNERS)
  owner!: (typeof RESPONSIBILITY_OWNERS)[number];

  @ApiPropertyOptional({ description: 'Notes', example: 'Per AOC section 1d' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'The split was confirmed against the TPSP (AOC or written agreement). A matrix counts as done only when every row is confirmed and each shared row has a note.',
  })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

/**
 * Third-party service provider profile fields (ISO 27001 A.5.19-A.5.22,
 * PCI DSS 12.8). Dates are ISO strings; null clears a field.
 */
export class VendorTpspFieldsDto {
  @ApiPropertyOptional({ enum: VendorCriticality, nullable: true })
  @IsOptional()
  @IsEnum(VendorCriticality)
  criticality?: VendorCriticality | null;

  @ApiPropertyOptional({
    description: 'Account data is shared with this vendor (PCI DSS 12.8.1)',
  })
  @IsOptional()
  @IsBoolean()
  handlesCardholderData?: boolean;

  @ApiPropertyOptional({
    description: 'Vendor can affect the security of account data / the CDE',
  })
  @IsOptional()
  @IsBoolean()
  affectsCdeSecurity?: boolean;

  @ApiPropertyOptional({
    description: 'Types of data the vendor processes',
    type: 'array',
    items: { type: 'string', enum: [...VENDOR_DATA_TYPES] },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(VENDOR_DATA_TYPES.length)
  @IsIn(VENDOR_DATA_TYPES, { each: true })
  dataTypes?: string[];

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  contractStartDate?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  contractEndDate?: string | null;

  @ApiPropertyOptional({
    description: 'Contract has information security clauses (ISO A.5.20)',
  })
  @IsOptional()
  @IsBoolean()
  securityClausesConfirmed?: boolean;

  @ApiPropertyOptional({ description: 'Contract has confidentiality clauses' })
  @IsOptional()
  @IsBoolean()
  confidentialityClausesConfirmed?: boolean;

  @ApiPropertyOptional({
    description:
      "Date the TPSP's written acknowledgement of responsibility was received (PCI DSS 12.8.2)",
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  tpspAcknowledgementDate?: string | null;

  @ApiPropertyOptional({
    description: 'PCI DSS 12.8.5 responsibility matrix',
    type: [ResponsibilityMatrixRowDto],
    nullable: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ResponsibilityMatrixRowDto)
  responsibilityMatrix?: ResponsibilityMatrixRowDto[] | null;

  @ApiPropertyOptional({ enum: VendorAssuranceType, nullable: true })
  @IsOptional()
  @IsEnum(VendorAssuranceType)
  assuranceType?: VendorAssuranceType | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  assurancePeriodStart?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  assurancePeriodEnd?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  assuranceExpiresAt?: string | null;

  @ApiPropertyOptional({ enum: VendorPciStatus, nullable: true })
  @IsOptional()
  @IsEnum(VendorPciStatus)
  pciStatus?: VendorPciStatus | null;

  @ApiPropertyOptional({
    description: 'When PCI DSS compliance status was last checked (12.8.4)',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  pciStatusCheckedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Override the next periodic review due date',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  nextReviewDue?: string | null;
}
