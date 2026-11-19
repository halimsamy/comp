import {
  Body,
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
import { getUnsubscribeUrl } from '@trycompai/email';
import { Footer } from '../components/footer';
import { Logo } from '../components/logo';

export interface DigestCard {
  label: string;
  needsAttention: number;
  href: string;
}

export interface DigestItem {
  id: string;
  title: string;
  subtitle: string | null;
  dueDate: string | null;
  href: string;
}

interface Props {
  frequency?: 'daily' | 'weekly';
  userName: string;
  organizationName: string;
  organizationId: string;
  cards: DigestCard[];
  overdue: DigestItem[];
  overdueCount: number;
  dueSoon: DigestItem[];
  dueSoonCount: number;
  noDueDateCount?: number;
  windowDays: number;
  /** Open tasks folded in from the Monday task digest (#10). */
  tasks?: Array<{ id: string; title: string }>;
  tasksCount?: number;
  email?: string;
}

const formatDate = (iso: string | null) =>
  iso === null
    ? 'no due date'
    : new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

function ItemList({
  items,
  url,
}: {
  items: DigestItem[];
  url: (href: string) => string;
}) {
  return (
    <ul className="pl-[16px]">
      {items.map((item) => (
        <li key={item.id} className="text-[14px] leading-[24px] text-[#121212]">
          <Link href={url(item.href)} className="text-[#121212] underline">
            {item.title}
          </Link>{' '}
          <span className="text-[#666666]">
            · {item.subtitle ? `${item.subtitle} · ` : ''}
            {formatDate(item.dueDate)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Program digest (weekly or daily): the same needs-attention cards and deadline queue as the overview page. */
export const WeeklyComplianceDigestEmail = ({
  frequency = 'weekly',
  userName,
  organizationName,
  organizationId,
  cards,
  overdue,
  overdueCount,
  dueSoon,
  dueSoonCount,
  noDueDateCount = 0,
  windowDays,
  tasks = [],
  tasksCount = 0,
  email,
}: Props) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    'https://app.trycomp.ai';
  const url = (href: string) => `${baseUrl}/${organizationId}${href}`;
  const attentionCards = cards.filter((card) => card.needsAttention > 0);

  return (
    <Html>
      <Tailwind>
        <head>
          <Font
            fontFamily="Geist"
            fallbackFontFamily="Helvetica"
            fontWeight={400}
            fontStyle="normal"
          />
          <Font
            fontFamily="Geist"
            fallbackFontFamily="Helvetica"
            fontWeight={500}
            fontStyle="normal"
          />
        </head>
        <Preview>
          {`${overdueCount} overdue and ${dueSoonCount} due soon in ${organizationName}`}
        </Preview>
        <Body className="mx-auto my-auto bg-[#fff] font-sans">
          <Container
            className="mx-auto my-[40px] max-w-[600px] border-transparent p-[20px] md:border-[#E8E7E1]"
            style={{ borderStyle: 'solid', borderWidth: 1 }}
          >
            <Logo />
            <Heading className="mx-0 my-[30px] p-0 text-center text-[24px] font-normal text-[#121212]">
              Your {frequency} compliance digest
            </Heading>
            <Text className="text-[14px] leading-[24px] text-[#121212]">
              Hi {userName},
            </Text>
            <Text className="text-[14px] leading-[24px] text-[#121212]">
              Here is what needs attention in{' '}
              <strong>{organizationName}</strong>{' '}
              {frequency === 'daily' ? 'today' : 'this week'}.
            </Text>

            {attentionCards.length > 0 && (
              <Section className="my-[12px]">
                <Text className="mb-[4px] mt-0 text-[16px] font-medium text-[#121212]">
                  Needs attention
                </Text>
                <ul className="pl-[16px]">
                  {attentionCards.map((card) => (
                    <li
                      key={card.label}
                      className="text-[14px] leading-[24px] text-[#121212]"
                    >
                      <Link
                        href={url(card.href)}
                        className="text-[#121212] underline"
                      >
                        {card.label}
                      </Link>
                      : {card.needsAttention}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {overdue.length > 0 && (
              <Section className="my-[12px]">
                <Text className="mb-[4px] mt-0 text-[16px] font-medium text-[#B42318]">
                  Overdue ({overdueCount})
                </Text>
                <ItemList items={overdue} url={url} />
              </Section>
            )}

            {dueSoon.length > 0 && (
              <Section className="my-[12px]">
                <Text className="mb-[4px] mt-0 text-[16px] font-medium text-[#121212]">
                  Due in the next {windowDays} days ({dueSoonCount})
                </Text>
                <ItemList items={dueSoon} url={url} />
              </Section>
            )}

            {noDueDateCount > 0 && (
              <Text className="text-[14px] leading-[24px] text-[#666666]">
                {noDueDateCount} open {noDueDateCount === 1 ? 'item has' : 'items have'} no due
                date.{' '}
                <Link href={url('/overview')} className="text-[#121212] underline">
                  Set due dates
                </Link>{' '}
                so nothing slips.
              </Text>
            )}

            {tasks.length > 0 && (
              <Section className="my-[12px]">
                <Text className="mb-[4px] mt-0 text-[16px] font-medium text-[#121212]">
                  Your open tasks ({tasksCount})
                </Text>
                <ul className="pl-[16px]">
                  {tasks.map((task) => (
                    <li key={task.id} className="text-[14px] leading-[24px] text-[#121212]">
                      <Link href={url(`/tasks/${task.id}`)} className="text-[#121212] underline">
                        {task.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section className="mb-[42px] mt-[32px] text-center">
              <a
                href={url('/overview')}
                className="inline-block border border-solid border-[#121212] bg-transparent px-6 py-3 text-center text-[14px] font-medium text-[#121212] no-underline"
              >
                Open overview
              </a>
            </Section>

            {email && (
              <Section>
                <Text className="text-[12px] leading-[24px] text-[#666666]">
                  <Link
                    href={getUnsubscribeUrl(email)}
                    className="text-[#121212] underline"
                  >
                    Unsubscribe
                  </Link>
                </Text>
              </Section>
            )}
            <br />
            <Footer />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
