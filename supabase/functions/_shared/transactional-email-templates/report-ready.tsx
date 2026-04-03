import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "BinCheckNYC"

interface ReportReadyProps {
  address?: string
  reportDate?: string
  riskLevel?: string
  reportUrl?: string
  citisignalRecommended?: boolean
  citisignalCtaUrl?: string
  hasOpenApplications?: boolean
  gleCtaUrl?: string
  clientName?: string
}

const ReportReadyEmail = ({
  address = '123 Main St, New York, NY',
  reportDate = '2026-04-03',
  riskLevel = 'Medium',
  reportUrl = '#',
  citisignalRecommended = false,
  citisignalCtaUrl = '#',
  hasOpenApplications = false,
  gleCtaUrl = '#',
  clientName,
}: ReportReadyProps) => {
  const riskColor = riskLevel === 'High' ? '#dc2626' : riskLevel === 'Medium' ? '#d97706' : '#16a34a'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your BinCheckNYC compliance report for {address} is ready</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {clientName ? `${clientName}, your` : 'Your'} report is ready
          </Heading>

          <Text style={text}>
            Your due diligence compliance report for <strong>{address}</strong> has been reviewed and approved by our team.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryLabel}>Property</Text>
            <Text style={summaryValue}>{address}</Text>
            <Text style={summaryLabel}>Report Date</Text>
            <Text style={summaryValue}>{reportDate}</Text>
            <Text style={summaryLabel}>Risk Assessment</Text>
            <Text style={{ ...summaryValue, color: riskColor, fontWeight: '700' }}>{riskLevel} Risk</Text>
          </Section>

          <Section style={{ textAlign: 'center' as const, margin: '30px 0' }}>
            <Button style={primaryButton} href={reportUrl}>
              View Your Report
            </Button>
          </Section>

          {citisignalRecommended && (
            <>
              <Hr style={divider} />
              <Section style={upsellBox}>
                <Heading as="h2" style={h2}>📡 Ongoing Compliance Monitoring</Heading>
                <Text style={text}>
                  This property has characteristics that benefit from continuous monitoring. CitiSignal tracks violations, permits, and complaints in real-time so you're never caught off guard.
                </Text>
                <Section style={{ textAlign: 'center' as const, margin: '16px 0' }}>
                  <Button style={secondaryButton} href={citisignalCtaUrl}>
                    Learn About CitiSignal Monitoring
                  </Button>
                </Section>
              </Section>
            </>
          )}

          {hasOpenApplications && (
            <>
              <Hr style={divider} />
              <Section style={upsellBox}>
                <Heading as="h2" style={h2}>📋 Open Permits Need Closing?</Heading>
                <Text style={text}>
                  Your property has open DOB applications that may need to be closed out before a transaction can proceed. Green Light Expediting can handle the process for you.
                </Text>
                <Section style={{ textAlign: 'center' as const, margin: '16px 0' }}>
                  <Button style={secondaryButton} href={gleCtaUrl}>
                    Get Permit Closeout Help
                  </Button>
                </Section>
              </Section>
            </>
          )}

          <Hr style={divider} />
          <Text style={footer}>
            This report was prepared by {SITE_NAME}. If you have questions, reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ReportReadyEmail,
  subject: (data: Record<string, any>) =>
    `Your BinCheckNYC Report for ${data.address || 'your property'} is Ready`,
  displayName: 'Report ready notification',
  previewData: {
    address: '350 Fifth Avenue, New York, NY',
    reportDate: '2026-04-03',
    riskLevel: 'Medium',
    reportUrl: 'https://binchecknyc.com/dashboard',
    citisignalRecommended: true,
    citisignalCtaUrl: 'https://citisignal.com?ref=bincheck',
    hasOpenApplications: true,
    gleCtaUrl: 'https://greenlightexpediting.com?ref=bincheck',
    clientName: 'Jane',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '580px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 16px' }
const h2 = { fontSize: '18px', fontWeight: '600' as const, color: '#1a1a2e', margin: '0 0 10px' }
const text = { fontSize: '15px', color: '#4a4a5a', lineHeight: '1.6', margin: '0 0 16px' }
const summaryBox = { backgroundColor: '#f8f8fa', borderRadius: '8px', padding: '20px', margin: '20px 0' }
const summaryLabel = { fontSize: '11px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 2px', fontWeight: '600' as const }
const summaryValue = { fontSize: '15px', color: '#1a1a2e', margin: '0 0 14px', fontWeight: '500' as const }
const primaryButton = { backgroundColor: '#dc3545', color: '#ffffff', padding: '14px 32px', borderRadius: '6px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none' }
const secondaryButton = { backgroundColor: '#1a1a2e', color: '#ffffff', padding: '12px 28px', borderRadius: '6px', fontSize: '14px', fontWeight: '500' as const, textDecoration: 'none' }
const upsellBox = { backgroundColor: '#fafafa', borderRadius: '8px', padding: '20px', margin: '16px 0' }
const divider = { borderColor: '#e8e8ed', margin: '28px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }
