import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'BinCheckNYC'
const SITE_URL = 'https://binchecknyc.com'

interface OrderConfirmationProps {
  clientName?: string
  address?: string
  plan?: 'starter' | 'professional' | 'enterprise' | string
  priceLabel?: string
  rushRequested?: boolean
  requestedDeliveryDate?: string | null
  reportId?: string
  preparedFor?: string
  clientFirm?: string | null
}

const planCopy: Record<string, string> = {
  starter: 'One-time report',
  professional: 'Professional plan (10 reports / month)',
  enterprise: 'Enterprise engagement',
}

const OrderConfirmationEmail = ({
  clientName,
  address = 'your property',
  plan = 'starter',
  priceLabel = '$499',
  rushRequested = false,
  requestedDeliveryDate,
  reportId,
  preparedFor,
  clientFirm,
}: OrderConfirmationProps) => {
  const planLabel = planCopy[plan] ?? plan
  const greeting = clientName ? `Hi ${clientName},` : 'Hi there,'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your BinCheckNYC report for {address} is in motion</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Order received</Heading>
          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            We have your order for <strong>{address}</strong> and our analysts are starting on it now.
          </Text>

          <Section style={card}>
            <Row>
              <Column style={cardLabel}>Property</Column>
              <Column style={cardValue}>{address}</Column>
            </Row>
            {preparedFor ? (
              <Row>
                <Column style={cardLabel}>Prepared for</Column>
                <Column style={cardValue}>{preparedFor}</Column>
              </Row>
            ) : null}
            {clientFirm ? (
              <Row>
                <Column style={cardLabel}>Firm</Column>
                <Column style={cardValue}>{clientFirm}</Column>
              </Row>
            ) : null}
            <Row>
              <Column style={cardLabel}>Plan</Column>
              <Column style={cardValue}>{planLabel}</Column>
            </Row>
            <Row>
              <Column style={cardLabel}>Amount</Column>
              <Column style={cardValue}><strong>{priceLabel}</strong> (invoice on delivery, Net 7)</Column>
            </Row>
            {rushRequested ? (
              <Row>
                <Column style={cardLabel}>Rush</Column>
                <Column style={cardValue}>Requested</Column>
              </Row>
            ) : null}
            {requestedDeliveryDate ? (
              <Row>
                <Column style={cardLabel}>Target delivery</Column>
                <Column style={cardValue}>{requestedDeliveryDate}</Column>
              </Row>
            ) : null}
            {reportId ? (
              <Row>
                <Column style={cardLabel}>Report ID</Column>
                <Column style={cardValueMono}>{reportId}</Column>
              </Row>
            ) : null}
          </Section>

          <Heading as="h2" style={h2}>What happens next</Heading>
          <Text style={text}>
            1. Our team pulls every relevant filing, permit, and ACRIS record we can find for the property.
          </Text>
          <Text style={text}>
            2. We compile a structured PDF report and double-check it against primary sources.
          </Text>
          <Text style={text}>
            3. You get the report by email along with a Stripe invoice. You only owe if we deliver.
          </Text>

          <Hr style={divider} />
          <Text style={footer}>
            Reply to this email if anything changes — we will route it straight to the analyst on this order.<br /><br />
            \u2014 The {SITE_NAME} Team<br />
            {SITE_URL.replace('https://', '')}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OrderConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `Order received \u2014 ${data.address || 'your property'} is in motion`,
  displayName: 'Order confirmation',
  previewData: {
    clientName: 'Jane',
    address: '350 Fifth Avenue, New York, NY',
    plan: 'starter',
    priceLabel: '$499',
    rushRequested: false,
    requestedDeliveryDate: null,
    reportId: 'rep_abc123',
    preparedFor: 'Jane Doe',
    clientFirm: 'Acme Architects',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f6f6f9', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '580px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '8px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px' }
const h2 = { fontSize: '16px', fontWeight: '600' as const, color: '#1a1a2e', margin: '24px 0 12px' }
const text = { fontSize: '15px', color: '#3a3a4a', lineHeight: '1.6', margin: '0 0 12px' }
const card = {
  backgroundColor: '#f9f9fc',
  borderRadius: '6px',
  padding: '16px 18px',
  margin: '8px 0 16px',
  border: '1px solid #e8e8ed',
}
const cardLabel = { fontSize: '12px', color: '#6a6a7a', padding: '6px 0', width: '40%', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const cardValue = { fontSize: '14px', color: '#1a1a2e', padding: '6px 0' }
const cardValueMono = { ...cardValue, fontFamily: 'monospace, monospace', fontSize: '12px' }
const divider = { borderColor: '#e8e8ed', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '8px 0 0', lineHeight: '1.5' }
