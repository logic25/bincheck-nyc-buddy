import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Button, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "BinCheckNYC"
const APP_URL = "https://www.binchecknyc.com"

interface BugStatusUpdateProps {
  reporterName?: string
  bugTitle?: string
  eventType?: 'reply' | 'status_change' | 'resolved'
  actorName?: string
  newStatus?: string
  message?: string
  bugId?: string
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  resolved: 'Resolved',
}

const BugStatusUpdateEmail = ({
  reporterName,
  bugTitle = 'your bug report',
  eventType = 'reply',
  actorName = 'The team',
  newStatus,
  message,
  bugId,
}: BugStatusUpdateProps) => {
  const isResolved = eventType === 'resolved' || newStatus === 'resolved'
  const headline = isResolved
    ? `Your bug report was resolved`
    : eventType === 'status_change'
      ? `Update on your bug report`
      : `New reply on your bug report`

  const preview = isResolved
    ? `${bugTitle} — marked Resolved`
    : eventType === 'status_change'
      ? `${bugTitle} — now ${STATUS_LABEL[newStatus || ''] || newStatus}`
      : `${actorName} replied to ${bugTitle}`

  const helpUrl = `${APP_URL}/help${bugId ? `?bug=${bugId}` : ''}`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{headline}</Heading>

          <Text style={text}>
            {reporterName ? `Hi ${reporterName},` : 'Hi,'}
          </Text>

          <Text style={text}>
            <strong>{bugTitle}</strong>
          </Text>

          {isResolved ? (
            <Text style={text}>
              {actorName} marked this bug as <strong>Resolved</strong>.
            </Text>
          ) : eventType === 'status_change' ? (
            <Text style={text}>
              Status changed to <strong>{STATUS_LABEL[newStatus || ''] || newStatus}</strong> by {actorName}.
            </Text>
          ) : (
            <Text style={text}>
              {actorName} posted a reply:
            </Text>
          )}

          {message && (
            <Section style={quote}>
              <Text style={quoteText}>{message}</Text>
            </Section>
          )}

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={helpUrl} style={button}>
              View bug report
            </Button>
          </Section>

          <Hr style={divider} />
          <Text style={footer}>
            {SITE_NAME} · Help Center
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BugStatusUpdateEmail,
  subject: (data: Record<string, any>) => {
    const title = data.bugTitle || 'your bug report'
    if (data.eventType === 'resolved' || data.newStatus === 'resolved') {
      return `Resolved: ${title}`
    }
    if (data.eventType === 'status_change') {
      const label = STATUS_LABEL[data.newStatus] || data.newStatus || 'Updated'
      return `[${label}] ${title}`
    }
    return `New reply: ${title}`
  },
  displayName: 'Bug report update',
  previewData: {
    reporterName: 'Jane',
    bugTitle: "[DD Reports] Couldn't generate a DD report",
    eventType: 'reply',
    actorName: 'Manny',
    message: 'Looking into this now — should have a fix shortly.',
    bugId: '006c8335-542f-4644-9951-42038b47535f',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '580px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1E3A5F', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#4a4a5a', lineHeight: '1.6', margin: '0 0 12px' }
const quote = {
  borderLeft: '3px solid #1E3A5F',
  padding: '8px 14px',
  margin: '16px 0',
  backgroundColor: '#f7f8fa',
}
const quoteText = { fontSize: '14px', color: '#333', lineHeight: '1.55', margin: 0, whiteSpace: 'pre-wrap' as const }
const button = {
  backgroundColor: '#1E3A5F',
  color: '#ffffff',
  padding: '11px 22px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block',
}
const divider = { borderColor: '#e8e8ed', margin: '28px 0' }
const footer = { fontSize: '12px', color: '#888', margin: 0 }
