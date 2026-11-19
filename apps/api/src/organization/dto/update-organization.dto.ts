import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fields an organization member may update on their own organization.
 *
 * Note: this is a class (not an interface) on purpose — the global
 * ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`, which only
 * enforce the contract when class-validator metadata survives to runtime.
 * Properties that are not represented here are rejected by the pipe. The
 * request/response documentation lives in `organization-api-bodies.ts`.
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  metadata?: string;

  @IsOptional()
  @IsString()
  website?: string;

  /** Registered company name, for ISMS/SoA headers. Empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  registeredAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;

  @IsOptional()
  @IsInt()
  fleetDmLabelId?: number;

  @IsOptional()
  @IsBoolean()
  isFleetSetupCompleted?: boolean;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsBoolean()
  advancedModeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  backgroundCheckStepEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  evidenceApprovalEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  deviceAgentStepEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  securityTrainingStepEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whistleblowerReportEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  accessRequestFormEnabled?: boolean;
}
