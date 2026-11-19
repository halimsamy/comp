import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
} from 'class-validator';

class BulkPolicyIdsDto {
  @ApiProperty({
    description: 'Policy IDs to act on (max 200)',
    example: ['pol_abc123def456'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  policyIds: string[];
}

export class BulkSubmitForApprovalDto extends BulkPolicyIdsDto {
  @ApiProperty({
    description: 'Member ID of the approver for every selected policy',
    example: 'mem_abc123def456',
  })
  @IsString()
  approverId: string;
}

export class BulkSetOwnerDto extends BulkPolicyIdsDto {
  @ApiProperty({
    description: 'Member ID of the new policy owner',
    example: 'mem_abc123def456',
  })
  @IsString()
  ownerId: string;
}
