import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class GenerateAllDto {
  @ApiProperty({
    description:
      'ID of the framework to generate all ISMS profile documents for',
    example: 'frk_abc123def456',
  })
  @IsString()
  frameworkId!: string;

  @ApiPropertyOptional({
    description:
      'Only refresh documents still in draft or declined, leaving approved and pending-approval documents untouched',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  draftsOnly?: boolean;
}
