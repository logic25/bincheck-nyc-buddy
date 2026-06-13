import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'BinCheckNYC'
const SITE_URL = 'https://binchecknyc.com'

type Intent = 'sample' | 'pricing' | 'enterprise' | 'general'

interface MarketingLeadConfirmationProps {
  firstName?: string
  intent?: Intent
  company?: string
}

const copyByIntent: Record<Intent, { headline: string; lead: string; followup: string; ctaLabel?: string; ctaHref?: string }> = {
  sample: {
    headline: 'Your sample BinCheckNYC report is on the way',
    lead:
      'Thanks for requesting a sample report. We will email a redacted PDF within one business day so you can see exactly what a deliverable looks like.',
    followup:
      'In the meantime, you can preview the agency landing pages and methodology at the link below.',
    ctaLabel: 'See how it works',
    ctaHref: `${SITE_URL}/how-it-works`,
  },
  pricing: {
    headline: 'Thanks for your interest in BinCheckNYC pricing',
    lead:
      'We received your request and will follow up within one business day with pricing options for one-off reports, the monthly plan, and enterprise volume.',
    followup:
      'Standard pricing is $499 per report or $2,499/month for ten reports. Enterprise volume gets a custom rate. Invoices are sent on delivery — no card required up front.',
    ctaLabel: 'Compare plans',
    ctaHref: `${SITE_URL}/pricing`,
  },
  enterprise: {
    headline: 'Let\u2019s talk enterprise volume',
    lead:
      'Thanks for reaching out about an enterprise engagement. A team member will contact you within one business day to schedule a short scoping call.',
    followup:
      'If it helps, include the typical volume of properties per month and any specific filings you need surfaced in your reply.',
    ctaLabel: 'View capabilities',
    ctaHref: `${SITE_URL}/enterprise`,
  },
  general: {
    headline: 'We received your message',
    lead:
      'Thanks for reaching out to BinCheckNYC. We will respond within one business day.',
    followup:
      'If your question is urgent, just reply to this email and it will route straight to the team.',
  },
}

const MarketingLeadConfirmationEmail = ({
  firstName,
  intent = 'general',
  company,
}: MarketingLeadConfirmationProps) => {
  const copy = copyByIntent[intent] ?? copyByIntent.general
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{copy.headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{copy.headline}</Heading>
          <Text style={text}>{greeting}</Text>
          <Text style={text}>{copy.lead}</Text>
          {company ? (
            <Text style={text}>
              We have you logged under <strong>{company}</strong>. Reply if that\u2019s wrong and we will fix it.
            </Text>
          ) : null}
          <Text style={text}>{copy.followup}</Text>

          {copy.ctaLabel && copy.ctaHref ? (
            <Section style={ctaSection}>
              <Button href={copy.ctaHref} style={ctaButton}>
                {copy.ctaLabel}
              </Button>
            </Section>
          ) : null}

          <Hr style={divider} />
          <Text style={footer}>
            \u2014 The {SITE_NAME} Team<br />
            {SITE_URL.replace('https://', '')}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MarketingLeadConfirmationEmail,
  subject: (data: Record<string, any>) => {
    const intent = (data.intent as Intent) || 'general'
    return copyByIntent[intent]?.headline ?? copyByIntent.general.headline
  },
  displayName: 'Marketing lead confirmation',
  previewData: {
    firstName: 'Jane',
    intent: 'pricing',
    company: 'Acme Architects',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f6f6f9', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '580px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '8px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 14px' }
const ctaSection = { margin: '24px 0' }
const ctaButton = {
  backgroundColor: '#1a1a2e',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: '600' as const,
  display: 'inline-block',
}
const divider = { borderColor: '#e8e8ed', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '8px 0 0', lineHeight: '1.5' }
