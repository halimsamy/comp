import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AutoFillSOADto {
  @IsString()
  organizationId!: string;

  @IsString()
  documentId!: string;

  /** Only fill controls without a decision yet ("Fill remaining"). */
  @IsOptional()
  @IsBoolean()
  onlyUnanswered?: boolean;
}
