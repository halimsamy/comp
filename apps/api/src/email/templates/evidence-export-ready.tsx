import {
  Body,
  Button,
  Container,
  Font,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import { Footer } from '../components/footer';
import { Logo } from '../components/logo';

interface Props {
  email: string;
  organizationName: string;
  frameworkName: string;
  periodLabel: string;
  downloadUrl: string;
  expiresInHours: number;
}

/** Sent to the requester when a framework evidence ZIP has finished building. */
export const EvidenceExportReadyEmail = ({
  email,
  organizationName,
  frameworkName,
  periodLabel,
  downloadUrl,
  expiresInHours,
}: Props) => (
  <Html>
    <Tailwind>
      <head>
        <Font fontFamily="Geist" fallbackFontFamily="Helvetica" fontWeight={400} fontStyle="normal" />
        <Font fontFamily="Geist" fallbackFontFamily="Helvetica" fontWeight={500} fontStyle="normal" />
      </head>
      <Preview>Your {frameworkName} evidence export is ready</Preview>
      <Body className="mx-auto my-auto bg-[#fff] font-sans">
        <Container
          className="mx-auto my-[40px] max-w-[600px] border-transparent p-[20px] md:border-[#E8E7E1]"
          style={{ borderStyle: 'solid', borderWidth: 1 }}
        >
          <Logo />
          <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-[#121212]">
            Evidence export ready
          </Heading>
          <Text className="text-[14px] leading-[24px] text-[#121212]">
            The {frameworkName} evidence ZIP for <strong>{organizationName}</strong> ({periodLabel})
            is ready to download.
          </Text>
          <Section className="mt-[24px] mb-[24px] text-center">
            <Button
              href={downloadUrl}
              className="rounded-[6px] bg-[#121212] px-[20px] py-[12px] text-[14px] text-white"
            >
              Download ZIP
            </Button>
          </Section>
          <Text className="text-[14px] leading-[24px] text-[#121212]">
            The link expires in {expiresInHours} hours. Export again from the framework page if you
            need a new one.
          </Text>
          <br />
          <Section>
            <Text className="text-[12px] leading-[24px] text-[#666666]">
              This notification was intended for <span className="text-[#121212]">{email}</span>.
            </Text>
          </Section>
          <br />
          <Footer />
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default EvidenceExportReadyEmail;
