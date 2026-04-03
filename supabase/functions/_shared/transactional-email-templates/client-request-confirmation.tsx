import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "BinCheckNYC"

interface ClientRequestConfirmationProps {
  clientName?: string
  requestType?: string
  propertyAddress?: string
}

const ClientRequestConfirmationEmail = ({
  clientName,
  requestType = 'service request',
  propertyAddress = 'your property',
}: ClientRequestConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {requestType} request has been received</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {clientName ? `Thank you, ${clientName}!` : 'Thank you!'}
        </Heading>

        <Text style={text}>
          We have received your <strong>{requestType}</strong> request for <strong>{propertyAddress}</strong>.
        </Text>

        <Text style={text}>
          Green Light Expediting will contact you within <strong>24 hours</strong> to discuss next steps and get started on your request.
        </Text>

        <Text style={text}>
          If you have any questions in the meantime, you can reply to this email.
        </Text>

        <Hr style={divider} />
        <Text style={footer}>
          Best regards,<br />
          The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClientRequestConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `Your ${data.requestType || 'service'} request has been received`,
  displayName: 'Client request confirmation',
  previewData: {
    clientName: 'Jane',
    requestType: 'Architect Opinion Letter',
    propertyAddress: '350 Fifth Avenue, New York, NY',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '580px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4a4a5a', lineHeight: '1.6', margin: '0 0 16px' }
const divider = { borderColor: '#e8e8ed', margin: '28px 0' }
const footer = { fontSize: '13px', color: '#888', margin: '16px 0 0' }
