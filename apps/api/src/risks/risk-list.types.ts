import type { Prisma } from '@db';

export interface PaginatedRisksResult {
  data: Prisma.RiskGetPayload<{
    include: {
      assignee: {
        include: {
          user: {
            select: { id: true; name: true; email: true; image: true };
          };
        };
      };
    };
  }>[];
  totalCount: number;
  page: number;
  pageCount: number;
}
