import { Body, Controller, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ActingUserResolver } from '../auth/acting-user.service';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/types';
import { CreateDeviceDto } from './dto/create-device.dto';
import { createManualDevice, updateManualDevice } from './manual-device';

/** Devices recorded by hand, with attested checks (no agent or device sync). */
@ApiTags('Devices')
@Controller({ path: 'devices', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class ManualDevicesController {
  constructor(private readonly actingUser: ActingUserResolver) {}

  @Post()
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Add a device manually',
    description:
      'Records an employee device that has no agent or device sync, with attested disk encryption, antivirus, password policy and screen lock checks.',
  })
  @ApiBody({ type: CreateDeviceDto })
  @ApiResponse({ status: 201, description: 'Device added' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async createDevice(
    @OrganizationId() organizationId: string,
    @Body() body: CreateDeviceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const attestedById = await this.attester({ req, organizationId });
    return createManualDevice({ organizationId, dto: body, attestedById });
  }

  @Put(':id')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Update a manually added device',
    description:
      'Replaces the details and attested checks of a device that was added manually. Agent and synced devices report their own checks and cannot be edited.',
  })
  @ApiParam({ name: 'id', description: 'Device id' })
  @ApiBody({ type: CreateDeviceDto })
  @ApiResponse({ status: 200, description: 'Device updated' })
  @ApiResponse({ status: 404, description: 'Manual device or member not found' })
  async updateDevice(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body() body: CreateDeviceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const attestedById = await this.attester({ req, organizationId });
    return updateManualDevice({ organizationId, id, dto: body, attestedById });
  }

  /** The real person attesting the checks; never the owner fallback (export shows "Not recorded"). */
  private async attester({
    req,
    organizationId,
  }: {
    req: AuthenticatedRequest;
    organizationId: string;
  }): Promise<string | null> {
    const { userId, source } = await this.actingUser.resolve(req, organizationId);
    return source === 'org-owner-fallback' ? null : userId;
  }
}
