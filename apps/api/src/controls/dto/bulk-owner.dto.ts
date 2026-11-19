import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class BulkControlOwnerDto {
  @ApiProperty({
    description: 'Controls to update',
    example: ['ctl_abc123', 'ctl_def456'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  controlIds!: string[];

  @ApiProperty({
    description: 'Member ID of the new owner; null clears the owner',
    example: 'mem_abc123',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerId!: string | null;

  @ApiPropertyOptional({
    description:
      'Also assign the linked tasks and policies that have no assignee yet to the new owner',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  assignLinkedWork?: boolean;
}
