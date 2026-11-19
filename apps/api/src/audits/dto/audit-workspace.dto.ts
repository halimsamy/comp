import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DAY } from './audits.dto';

export const REVIEW_STATUSES = ['accepted', 'flagged', 'requested'] as const;

export class ReviewRequirementDto {
  @ApiProperty({ enum: REVIEW_STATUSES, description: "The auditor's assessment" })
  @IsIn(REVIEW_STATUSES)
  status: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Why it was flagged or what is still needed' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

export class CreateAuditCommentDto {
  @ApiPropertyOptional({ description: 'Requirement the comment is about; omit for the whole audit' })
  @IsOptional()
  @IsString()
  requirementId?: string;

  @ApiProperty({ description: 'Comment text', example: 'Can you share the Q3 access review?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;
}

export class CreateAuditRequestDto {
  @ApiProperty({ description: 'What the auditor needs', example: 'Population of new hires in 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Details of the request' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ description: 'Requirement the request is for' })
  @IsOptional()
  @IsString()
  requirementId?: string;

  @ApiPropertyOptional({ description: 'Due date (YYYY-MM-DD)', example: '2026-12-15' })
  @IsOptional()
  @Matches(DAY, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;
}

export class TeamAuditRequestDto extends CreateAuditRequestDto {
  @ApiPropertyOptional({ description: 'Team member who prepares the evidence', example: 'mem_abc123' })
  @IsOptional()
  @IsString()
  ownerMemberId?: string;
}

export class CreateTeamAuditRequestsDto {
  @ApiProperty({
    type: [TeamAuditRequestDto],
    description: "Requests from the auditor's request list (PBC list), logged by the team",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TeamAuditRequestDto)
  requests: TeamAuditRequestDto[];
}

export class RespondAuditRequestDto {
  @ApiProperty({ description: 'Answer to the request; attach files separately' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  response: string;
}

export const REQUEST_DECISIONS = ['accepted', 'open'] as const;

export class DecideAuditRequestDto {
  @ApiProperty({
    enum: REQUEST_DECISIONS,
    description: 'accepted closes the request; open sends it back to the team',
  })
  @IsIn(REQUEST_DECISIONS)
  status: (typeof REQUEST_DECISIONS)[number];
}
