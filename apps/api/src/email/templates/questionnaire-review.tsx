import {
  Body,
  Button,
  Container,
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
  preview: string;
  heading: string;
  message: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

/** Trust portal questionnaire review emails: "review needed" to admins, "answers attached" to the requester. */
export const QuestionnaireReviewEmail = ({
  preview,
  heading,
  message,
  ctaUrl,
  ctaLabel,
}: Props) => (
  <Html>
    <Tailwind>
      <Preview>{preview}</Preview>
      <Body className="mx-auto my-auto bg-[#fff] font-sans">
        <Container
          className="mx-auto my-[40px] max-w-[600px] border-transparent p-[20px] md:border-[#E8E7E1]"
          style={{ borderStyle: 'solid', borderWidth: 1 }}
        >
          <Logo />
          <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-[#121212]">
            {heading}
          </Heading>
          <Text className="text-[14px] leading-[24px] text-[#121212]">{message}</Text>
          {ctaUrl && ctaLabel && (
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded-[3px] bg-[#121212] px-[20px] py-[12px] text-center text-[14px] font-semibold text-white no-underline"
                href={ctaUrl}
              >
                {ctaLabel}
              </Button>
            </Section>
          )}
          <Footer />
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
