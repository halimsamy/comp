import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Font,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import { Footer } from '../components/footer';
import { Logo } from '../components/logo';
import { getUnsubscribeUrl } from '@trycompai/email';

export type PolicyApprovalEmailKind = 'requested' | 'reminder' | 'rejected';

interface Props {
  kind: PolicyApprovalEmailKind;
  toName: string;
  toEmail: string;
  policyName: string;
  version: number;
  actorName: string;
  organizationName: string;
  policyUrl: string;
  comment?: string | null;
}

const COPY: Record<
  PolicyApprovalEmailKind,
  { heading: string; button: string; body: (p: Props) => React.ReactNode }
> = {
  requested: {
    heading: 'Policy approval requested',
    button: 'Review policy',
    body: (p) => (
      <>
        <strong>{p.actorName}</strong> asked you to approve version {p.version} of{' '}
        <strong>"{p.policyName}"</strong> in <strong>{p.organizationName}</strong>.
      </>
    ),
  },
  reminder: {
    heading: 'Policy still waiting for your approval',
    button: 'Review policy',
    body: (p) => (
      <>
        Version {p.version} of <strong>"{p.policyName}"</strong> in{' '}
        <strong>{p.organizationName}</strong> has been waiting for your approval since{' '}
        {p.actorName}'s request. Employees keep the previous version until you decide.
      </>
    ),
  },
  rejected: {
    heading: 'Policy changes rejected',
    button: 'Open policy',
    body: (p) => (
      <>
        <strong>{p.actorName}</strong> rejected version {p.version} of{' '}
        <strong>"{p.policyName}"</strong> in <strong>{p.organizationName}</strong>.
      </>
    ),
  },
};

export const PolicyApprovalRequestedEmail = (props: Props) => {
  const copy = COPY[props.kind];
  const unsubscribeUrl = getUnsubscribeUrl(props.toEmail);

  return (
    <Html>
      <Tailwind>
        <head>
          <Font fontFamily="Geist" fallbackFontFamily="Helvetica" fontWeight={400} fontStyle="normal" />
          <Font fontFamily="Geist" fallbackFontFamily="Helvetica" fontWeight={500} fontStyle="normal" />
        </head>
        <Preview>{`${copy.heading}: "${props.policyName}"`}</Preview>

        <Body className="mx-auto my-auto bg-[#fff] font-sans">
          <Container
            className="mx-auto my-[40px] max-w-[600px] border-transparent p-[20px] md:border-[#E8E7E1]"
            style={{ borderStyle: 'solid', borderWidth: 1 }}
          >
            <Logo />
            <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-[#121212]">
              {copy.heading}
            </Heading>
            <Text className="text-[14px] leading-[24px] text-[#121212]">Hello {props.toName},</Text>
            <Text className="text-[14px] leading-[24px] text-[#121212]">{copy.body(props)}</Text>
            {props.comment && (
              <Text className="border-l-4 border-[#E8E7E1] pl-[12px] text-[14px] leading-[24px] text-[#121212]">
                "{props.comment}"
              </Text>
            )}
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded-[3px] bg-[#121212] px-[20px] py-[12px] text-center text-[14px] font-semibold text-white no-underline"
                href={props.policyUrl}
              >
                {copy.button}
              </Button>
            </Section>
            <Text className="text-[14px] leading-[24px] text-[#121212]">
              or copy and paste this URL into your browser:{' '}
              <a href={props.policyUrl} className="text-[#121212] underline">
                {props.policyUrl}
              </a>
            </Text>
            <Section className="mt-[30px] mb-[20px]">
              <Text className="text-[12px] leading-[20px] text-[#666666]">
                Don't want to receive policy notifications?{' '}
                <Link href={unsubscribeUrl} className="text-[#121212] underline">
                  Manage your email preferences
                </Link>
                .
              </Text>
            </Section>
            <br />
            <Footer />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default PolicyApprovalRequestedEmail;
