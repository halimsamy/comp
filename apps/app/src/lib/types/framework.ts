import type {
  Control,
  CustomFramework,
  FrameworkEditorFramework,
  FrameworkInstance,
  PolicyStatus,
  RequirementMap,
} from '@db';

export type FrameworkInstanceWithControls = FrameworkInstance & {
  framework: FrameworkEditorFramework | null;
  customFramework: CustomFramework | null;
  controls: (Control & {
    controlFamily?: string | null;
    policies: Array<{
      id: string;
      name: string;
      status: PolicyStatus;
    }>;
    requirementsMapped: RequirementMap[];
    owner?: { id: string; deactivated: boolean; user: { name: string | null; email: string } } | null;
    controlDocumentTypes?: Array<{
      formType: string;
      isNotRelevant?: boolean;
    }>;
  })[];
};

export interface FrameworkInstanceWithComplianceScore {
  frameworkInstance: FrameworkInstanceWithControls;
  complianceScore: number;
  controlsComplete?: number;
  controlsTotal?: number;
}
