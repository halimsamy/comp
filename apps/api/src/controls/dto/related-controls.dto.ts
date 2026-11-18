import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { RELATED_ENTITY_TYPES, type RelatedEntityType } from '../related-controls.service';

export class RelatedEntityQueryDto {
  @ApiProperty({
    description: 'Kind of evidence the controls are linked to',
    enum: RELATED_ENTITY_TYPES,
    example: 'policy',
  })
  @IsIn(RELATED_ENTITY_TYPES)
  entityType!: RelatedEntityType;

  @ApiProperty({
    description:
      'Policy, task or ISMS document ID; for evidence_form, the form type (e.g. access_request)',
    example: 'pol_abc123',
  })
  @IsString()
  entityId!: string;
}

export class LinkRelatedControlsDto extends RelatedEntityQueryDto {
  @ApiProperty({ description: 'Control IDs to link', type: [String], example: ['ctl_abc123'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  controlIds!: string[];
}

export class UpdateControlOwnerDto {
  @ApiPropertyOptional({
    description: 'Member ID of the control owner; null clears the owner',
    example: 'mem_abc123',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  ownerId?: string | null;
}
