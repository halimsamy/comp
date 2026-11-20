import { Test, TestingModule } from '@nestjs/testing';
import { OrgChartController } from './org-chart.controller';
import { OrgChartService } from './org-chart.service';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';

jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('@trycompai/auth', () => ({
  statement: {
    organization: ['create', 'read', 'update', 'delete'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

describe('OrgChartController', () => {
  let controller: OrgChartController;
  let service: jest.Mocked<OrgChartService>;

  const mockService = {
    findByOrganization: jest.fn(),
    upsertInteractive: jest.fn(),
    uploadImage: jest.fn(),
    delete: jest.fn(),
    renderPdf: jest.fn(),
  };

  const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrgChartController],
      providers: [{ provide: OrgChartService, useValue: mockService }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<OrgChartController>(OrgChartController);
    service = module.get(OrgChartService);

    jest.clearAllMocks();
  });

  describe('getOrgChart', () => {
    it('should call service.findByOrganization with organizationId', async () => {
      const mockChart = { id: 'chart_1', type: 'interactive', nodes: [] };
      mockService.findByOrganization.mockResolvedValue(mockChart);

      const result = await controller.getOrgChart('org_1');

      expect(result).toEqual(mockChart);
      expect(service.findByOrganization).toHaveBeenCalledWith('org_1');
    });
  });

  describe('upsertOrgChart', () => {
    it('should call service.upsertInteractive with organizationId and parsed dto', async () => {
      const body = {
        name: 'My Org Chart',
        nodes: [{ id: 'n1', label: 'CEO' }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };
      const mockResult = { id: 'chart_1', ...body };
      mockService.upsertInteractive.mockResolvedValue(mockResult);

      const result = await controller.upsertOrgChart('org_1', body);

      expect(result).toEqual(mockResult);
      expect(service.upsertInteractive).toHaveBeenCalledWith('org_1', {
        name: 'My Org Chart',
        nodes: [{ id: 'n1', label: 'CEO' }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      });
    });

    it('should default nodes and edges to empty arrays when not provided', async () => {
      mockService.upsertInteractive.mockResolvedValue({ id: 'chart_1' });

      await controller.upsertOrgChart('org_1', {});

      expect(service.upsertInteractive).toHaveBeenCalledWith('org_1', {
        name: undefined,
        nodes: [],
        edges: [],
      });
    });

    it('should default name to undefined when not a string', async () => {
      mockService.upsertInteractive.mockResolvedValue({ id: 'chart_1' });

      await controller.upsertOrgChart('org_1', { name: 123 });

      expect(service.upsertInteractive).toHaveBeenCalledWith('org_1', {
        name: undefined,
        nodes: [],
        edges: [],
      });
    });
  });

  describe('uploadOrgChart', () => {
    it('should call service.uploadImage with organizationId and dto', async () => {
      const dto = { imageUrl: 'https://example.com/chart.png' };
      const mockResult = { id: 'chart_1', type: 'image' };
      mockService.uploadImage.mockResolvedValue(mockResult);

      const result = await controller.uploadOrgChart('org_1', dto as never);

      expect(result).toEqual(mockResult);
      expect(service.uploadImage).toHaveBeenCalledWith('org_1', dto);
    });
  });

  describe('exportOrgChartPdf', () => {
    it('renders the PDF for the organization and sends it as application/pdf', async () => {
      const dto = { name: 'Chart', asOf: '2026-11-20', peopleCount: 3, image: 'data:image/png;base64,AA==' };
      const pdf = Buffer.from('%PDF-');
      mockService.renderPdf.mockResolvedValue(pdf);
      const res = { setHeader: jest.fn(), send: jest.fn() };

      await controller.exportOrgChartPdf('org_1', dto, res as never);

      expect(service.renderPdf).toHaveBeenCalledWith({ organizationId: 'org_1', dto });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalledWith(pdf);
    });
  });

  describe('deleteOrgChart', () => {
    it('should call service.delete with organizationId', async () => {
      const mockResult = { success: true };
      mockService.delete.mockResolvedValue(mockResult);

      const result = await controller.deleteOrgChart('org_1');

      expect(result).toEqual(mockResult);
      expect(service.delete).toHaveBeenCalledWith('org_1');
    });
  });
});
