import {
  Body,
  Button,
  Container,
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

interface Props {
  toName: string;
  organizationName: string;
  portalUrl: string;
  /** One line per open obligation, e.g. "Security awareness training · 2 of 4 videos". */
  tasks: { title: string; detail: string }[];
  /** Policies waiting for the member's signature (the former policy digest). */
  policies: { name: string; url: string }[];
}

/** Weekly or daily "Your security tasks" reminder to an employee (#162). */
export const EmployeeSecurityTasksEmail = ({
  toName,
  organizationName,
  portalUrl,
  tasks,
  policies,
}: Props) => {
  const count = tasks.length;
  const preview = `You have ${count} security ${count === 1 ? 'task' : 'tasks'} to finish for ${organizationName}`;
  return (
    <Html>
      <Tailwind>
        {/* Tailwind needs a <head> to inline its styles; without it render() throws. */}
        <head />
        <Preview>{preview}</Preview>
        <Body className="mx-auto my-auto bg-[#fff] font-sans">
          <Container
            className="mx-auto my-[40px] max-w-[600px] border-transparent p-[20px] md:border-[#E8E7E1]"
            style={{ borderStyle: 'solid', borderWidth: 1 }}
          >
            <Logo />
            <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-[#121212]">
              Your security tasks
            </Heading>
            <Text className="text-[14px] leading-[24px] text-[#121212]">
              Hi {toName || 'there'}, {organizationName} needs you to finish these:
            </Text>
            {tasks.map((task) => (
              <Text key={task.title} className="my-[4px] text-[14px] leading-[22px] text-[#121212]">
                • <strong>{task.title}</strong>: {task.detail}
              </Text>
            ))}
            {policies.length > 0 && (
              <>
                <Text className="mt-[20px] text-[14px] font-semibold text-[#121212]">
                  Policies to read and accept
                </Text>
                {policies.map((policy) => (
                  <Text key={policy.url} className="my-[4px] text-[14px] leading-[22px]">
                    <Link href={policy.url} className="text-[#121212] underline">
                      {policy.name}
                    </Link>
                  </Text>
                ))}
              </>
            )}
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded-[3px] bg-[#121212] px-[20px] py-[12px] text-center text-[14px] font-semibold text-white no-underline"
                href={portalUrl}
              >
                Open the employee portal
              </Button>
            </Section>
            <Footer />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
