import type { Metadata } from 'next';
import { AccessReviewDetail } from '../../components/AccessReviewDetail';

export const metadata: Metadata = { title: 'Access review' };

export default async function AccessReviewPage({
  params,
}: {
  params: Promise<{ orgId: string; reviewId: string }>;
}) {
  const { orgId, reviewId } = await params;
  return <AccessReviewDetail orgId={orgId} reviewId={reviewId} />;
}
