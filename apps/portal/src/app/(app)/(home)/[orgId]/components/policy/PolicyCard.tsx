'use client';

import type { PortalPolicy } from '@/lib/portal-policy-types';
import type { Member } from '@db';
import type { JSONContent } from '@tiptap/react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Text,
} from '@trycompai/design-system';
import { ArrowRight } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { policyAttestationText } from '@/lib/policy-attestation';
import { PolicyAttestation } from './PolicyAttestation';
import { PolicyEditor } from './PolicyEditor';
import { PortalPdfViewer } from './PortalPdfViewer';

interface PolicyCardProps {
  policy: PortalPolicy;
  onNext?: () => void;
  onComplete?: () => void;
  onClick?: () => void;
  member: Member;
  isLastPolicy?: boolean;
}

export function PolicyCard({ policy, onNext, onComplete, member, isLastPolicy }: PolicyCardProps) {
  const [isAccepted, setIsAccepted] = useState(policy.signedBy.includes(member.id));
  const [attested, setAttested] = useState(false);
  const version = policy.currentVersion?.version;

  const handleAccept = () => {
    setIsAccepted(true);
    onComplete?.();
  };

  // Use currentVersion content/pdfUrl if available, fallback to policy level for backward compatibility
  const effectivePdfUrl = policy.currentVersion?.pdfUrl ?? policy.pdfUrl;
  const effectiveContent = policy.currentVersion?.content ?? policy.content;
  const isPdfPolicy = policy.displayFormat === 'PDF' && effectivePdfUrl;

  return (
    <div className="relative">
      <Card>
        {isAccepted && (
          <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-xs">
            <div className="space-y-4 text-center">
              <Text weight="medium">Policy Accepted</Text>
              <Text variant="muted">You have accepted this policy</Text>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setIsAccepted(false)}>
                  View Again
                </Button>
                {!isLastPolicy && (
                  <Button onClick={onNext} iconRight={<ArrowRight size={16} />}>
                    Next Policy
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        <CardHeader>
          <CardTitle>{policy.name}</CardTitle>
          <CardDescription>{policy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full border-t border-border pt-6">
            <div className="max-w-none">
              {isPdfPolicy ? (
                <PortalPdfViewer
                  policyId={policy.id}
                  organizationId={policy.organizationId}
                  s3Key={effectivePdfUrl}
                  versionId={policy.currentVersion?.id}
                />
              ) : (
                <PolicyEditor content={effectiveContent as JSONContent[]} />
              )}
            </div>
            {version && (
              <Text variant="muted" size="sm">
                Version {version}
              </Text>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {policy.updatedAt && (
                <Text variant="muted" size="sm">
                  Last updated: {new Date(policy.updatedAt).toLocaleDateString()}
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <PolicyAttestation
                text={policyAttestationText({ policyName: policy.name, version })}
                checked={attested}
                onCheckedChange={setAttested}
              />
              <div>
                <Button onClick={handleAccept} disabled={!attested}>
                  Accept Policy
                </Button>
              </div>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
