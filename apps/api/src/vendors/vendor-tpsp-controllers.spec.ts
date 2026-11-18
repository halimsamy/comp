import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActingUserResolver } from '../auth/acting-user.service';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import type { AuthContext, AuthenticatedRequest } from '../auth/types';
import { CreateVendorReviewDto } from './dto/vendor-review.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorDocumentsController } from './vendor-documents.controller';
import { VendorDocumentsService } from './vendor-documents.service';
import { VendorReviewsController } from './vendor-reviews.controller';
import { VendorReviewsService } from './vendor-reviews.service';

jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {},
}));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: { vendor: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('../attachments/attachments.service', () => ({
  AttachmentsService: jest.fn(),
}));

const orgId = 'org_1';
const authContext: AuthContext = {
  organizationId: orgId,
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  userId: 'usr_1',
  userEmail: 'a@x.com',
  memberId: 'mem_1',
};
const req = {} as AuthenticatedRequest;

const permissionsOf = (handler: unknown) =>
  Reflect.getMetadata(PERMISSIONS_KEY, handler as object);

describe('vendor document and review controllers', () => {
  let documentsController: VendorDocumentsController;
  let reviewsController: VendorReviewsController;
  const documents = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDownloadUrl: jest.fn(),
    summarize: jest.fn(),
  };
  const reviews = { list: jest.fn(), signOff: jest.fn() };
  const actingUser = { resolve: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorDocumentsController, VendorReviewsController],
      providers: [
        { provide: VendorDocumentsService, useValue: documents },
        { provide: VendorReviewsService, useValue: reviews },
        { provide: ActingUserResolver, useValue: actingUser },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    documentsController = module.get(VendorDocumentsController);
    reviewsController = module.get(VendorReviewsController);
  });

  it('gates reads with vendor:read and mutations with vendor:update', () => {
    const read = [{ resource: 'vendor', actions: ['read'] }];
    const update = [{ resource: 'vendor', actions: ['update'] }];
    const d = VendorDocumentsController.prototype;
    const r = VendorReviewsController.prototype;
    expect(permissionsOf(d.listVendorDocuments)).toEqual(read);
    expect(permissionsOf(d.getVendorDocumentDownloadUrl)).toEqual(read);
    expect(permissionsOf(r.listVendorReviews)).toEqual(read);
    expect(permissionsOf(d.uploadVendorDocument)).toEqual(update);
    expect(permissionsOf(d.updateVendorDocument)).toEqual(update);
    expect(permissionsOf(d.deleteVendorDocument)).toEqual(update);
    expect(permissionsOf(d.summarizeVendorDocument)).toEqual(update);
    expect(permissionsOf(r.signOffVendorReview)).toEqual(update);
  });

  it('lists documents scoped to the organization', async () => {
    documents.list.mockResolvedValue([{ id: 'vdoc_1' }]);
    const result = await documentsController.listVendorDocuments(
      'vnd_1',
      orgId,
      authContext,
    );
    expect(documents.list).toHaveBeenCalledWith({
      vendorId: 'vnd_1',
      organizationId: orgId,
    });
    expect(result).toMatchObject({
      data: [{ id: 'vdoc_1' }],
      count: 1,
      authType: 'session',
    });
  });

  it('uploads as the acting user', async () => {
    actingUser.resolve.mockResolvedValue({ userId: 'usr_9' });
    documents.create.mockResolvedValue({ id: 'vdoc_1' });
    const dto = {
      type: 'pci_aoc' as const,
      fileName: 'aoc.pdf',
      fileType: 'application/pdf',
      fileData: 'JVBERi0=',
    };
    await documentsController.uploadVendorDocument(
      'vnd_1',
      dto,
      orgId,
      authContext,
      req,
    );
    expect(documents.create).toHaveBeenCalledWith({
      vendorId: 'vnd_1',
      organizationId: orgId,
      dto,
      userId: 'usr_9',
    });
  });

  it('refuses a review sign-off nobody can be attributed to', async () => {
    actingUser.resolve.mockResolvedValue({ userId: null });
    await expect(
      reviewsController.signOffVendorReview(
        'vnd_1',
        {
          outcome: 'approved',
          checklist: {
            assuranceReviewed: true,
            pciStatusConfirmed: true,
            contractReviewed: true,
            riskReassessed: true,
          },
        },
        orgId,
        authContext,
        req,
      ),
    ).rejects.toThrow('Cannot attribute');
    expect(reviews.signOff).not.toHaveBeenCalled();
  });
});

describe('vendor TPSP DTO validation', () => {
  const check = async <T extends object>(cls: new () => T, plain: object) =>
    validate(plainToInstance(cls, plain), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts TPSP profile fields and clearing dates with null', async () => {
    const errors = await check(UpdateVendorDto, {
      criticality: 'critical',
      handlesCardholderData: true,
      dataTypes: ['cardholder_data', 'customer_pii'],
      contractEndDate: null,
      tpspAcknowledgementDate: '2026-01-15T00:00:00.000Z',
      responsibilityMatrix: [{ requirement: '8.4 MFA', owner: 'shared' }],
      assuranceType: 'pci_aoc',
      pciStatus: 'compliant',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown data types, owners and criticality', async () => {
    const errors = await check(UpdateVendorDto, {
      criticality: 'extreme',
      dataTypes: ['everything'],
      responsibilityMatrix: [{ requirement: '1.1', owner: 'nobody' }],
    });
    expect(errors.map((e) => e.property).sort()).toEqual([
      'criticality',
      'dataTypes',
      'responsibilityMatrix',
    ]);
  });

  it('requires a full checklist on review sign-off', async () => {
    const errors = await check(CreateVendorReviewDto, {
      outcome: 'approved',
      checklist: { assuranceReviewed: true },
    });
    expect(errors.map((e) => e.property)).toEqual(['checklist']);
  });
});
