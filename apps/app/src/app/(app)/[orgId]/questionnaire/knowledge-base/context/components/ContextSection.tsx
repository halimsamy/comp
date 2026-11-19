'use client';

import { Button } from '@trycompai/ui/button';
import { Card } from '@trycompai/ui';
import { isJSON } from '@/lib/utils';
import { Chat, ChevronLeft, ChevronRight, Launch } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePagination } from '../../hooks/usePagination';
import type { ContextEntry } from '../../../components/types';

interface ContextSectionProps {
  contextEntries: ContextEntry[];
}

function hasValidAnswer(answer: string): boolean {
  if (!answer || answer.trim() === '') {
    return false;
  }

  if (isJSON(answer)) {
    try {
      const parsed = JSON.parse(answer);
      // Check if there are any non-empty values
      const hasNonEmptyValue = Object.values(parsed).some((value) => {
        if (typeof value === 'string') {
          return value.trim() !== '';
        }
        return !!value;
      });
      return hasNonEmptyValue;
    } catch {
      return false;
    }
  }

  return true;
}

function formatAnswer(answer: string): string {
  if (isJSON(answer)) {
    try {
      const parsed = JSON.parse(answer);
      const entries = Object.entries(parsed)
        .filter(([key, value]) => {
          if (typeof value === 'string') {
            return value.trim() !== '';
          }
          return !!value;
        })
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      return entries || '';
    } catch {
      return answer;
    }
  }

  return answer;
}

export function ContextSection({ contextEntries }: ContextSectionProps) {
  const params = useParams();
  const orgId = params.orgId as string;

  const validEntries = contextEntries.filter((entry) => entry.answer != null && hasValidAnswer(entry.answer));

  const { currentPage, totalPages, paginatedItems, handlePageChange } = usePagination({
    items: validEntries,
    itemsPerPage: 5,
  });

  return (
    <Card id="context" className="flex flex-col h-full">
      <div className="px-6 py-4 border-b">
            <div className="flex items-center gap-2">
              <Chat className="h-5 w-5 text-muted-foreground" />
              <span className="text-base font-semibold">Context</span>
              <span className="text-sm text-muted-foreground">
                ({validEntries.length})
              </span>
              <Link
                href={`/${orgId}/settings/context-hub`}
                className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Edit in Settings
                <Launch className="h-3.5 w-3.5" />
              </Link>
            </div>
      </div>
      <div className="px-6 pb-4 pt-4 flex flex-col flex-1">
            {validEntries.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No context entries found
              </div>
            ) : (
              <>
            <div className="flex flex-col gap-2 flex-1">
                  {paginatedItems.map((entry) => {
                    const formattedAnswer = formatAnswer(entry.answer ?? '');
                    return (
                      <div
                        key={entry.id}
                        className="rounded-md border border-border bg-background p-3 min-h-[82px] flex items-center"
                      >
                    <div className="flex items-start justify-between gap-2 w-full">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-foreground">
                              {entry.question}
                            </h4>
                            {formattedAnswer && (
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {formattedAnswer}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-end">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium min-w-[80px] text-center">
                        {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
      </div>
    </Card>
  );
}
