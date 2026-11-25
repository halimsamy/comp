import { Body, Controller, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateDeviceDto } from './dto/create-device.dto';
import { createManualDevice, updateManualDevice } from './manual-device';

/** Devices recorded by hand, with attested checks (no agent or device sync). */
@ApiTags('Devices')
@Controller({ path: 'devices', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class ManualDevicesController {
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
  ) {
    return createManualDevice({ organizationId, dto: body });
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
  ) {
    return updateManualDevice({ organizationId, id, dto: body });
  }
}
