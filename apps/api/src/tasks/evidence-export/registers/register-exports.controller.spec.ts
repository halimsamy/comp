jest.mock('@db', () => ({ db: {} }));
jest.mock('../../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('../../../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));
const mockBuild = jest.fn();
jest.mock('./registers', () => {
  const actual = jest.requireActual('./registers');
  const REGISTERS = Object.fromEntries(
    Object.entries(actual.REGISTERS as Record<string, object>).map(
      ([key, def]) => [
        key,
        { ...def, build: (...args: unknown[]) => mockBuild(key, ...args) },
      ],
    ),
  );
  return { ...actual, REGISTERS };
});

import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { HybridAuthGuard } from '../../../auth/hybrid-auth.guard';
import {
  PERMISSIONS_KEY,
  PermissionGuard,
} from '../../../auth/permission.guard';
import { RegisterExportsController } from './register-exports.controller';

describe('RegisterExportsController', () => {
  let controller: RegisterExportsController;
  const res = { setHeader: jest.fn(), send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBuild.mockResolvedValue('"a"\n"b"');
    const moduleRef = await Test.createTestingModule({
      controllers: [RegisterExportsController],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(RegisterExportsController);
  });

  it.each([
    ['exportRisks', 'risks', 'risk', 'risk-register'],
    ['exportRiskAcceptances', 'risk-acceptances', 'risk', 'risk-acceptances'],
    ['exportVendors', 'vendors', 'vendor', 'vendor-register'],
    ['exportPeople', 'people', 'member', 'people'],
    ['exportDevices', 'devices', 'member', 'devices'],
    ['exportOffboarding', 'offboarding', 'member', 'offboarding-records'],
    ['exportFindings', 'findings', 'finding', 'findings'],
  ] as const)(
    '%s builds the %s register for the caller org behind %s:read',
    async (method, key, resource, fileBase) => {
      await controller[method]('org_1', res as unknown as Response);

      expect(mockBuild).toHaveBeenCalledWith(key, { organizationId: 'org_1' });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(
          new RegExp(
            `^attachment; filename="${fileBase}-\\d{4}-\\d{2}-\\d{2}\\.csv"$`,
          ),
        ),
      );
      expect(res.send).toHaveBeenCalledWith('"a"\n"b"');
      expect(
        new Reflector().get(
          PERMISSIONS_KEY,
          RegisterExportsController.prototype[method],
        ),
      ).toEqual([{ resource, actions: ['read'] }]);
    },
  );
});
