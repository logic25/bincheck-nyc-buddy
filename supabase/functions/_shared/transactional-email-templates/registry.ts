/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as reportReady } from './report-ready.tsx'
import { template as gleLeadNotification } from './gle-lead-notification.tsx'
import { template as clientRequestConfirmation } from './client-request-confirmation.tsx'
import { template as marketingLeadConfirmation } from './marketing-lead-confirmation.tsx'
import { template as orderConfirmation } from './order-confirmation.tsx'
import { template as bugStatusUpdate } from './bug-status-update.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'report-ready': reportReady,
  'gle-lead-notification': gleLeadNotification,
  'client-request-confirmation': clientRequestConfirmation,
  'marketing-lead-confirmation': marketingLeadConfirmation,
  'order-confirmation': orderConfirmation,
  'bug-status-update': bugStatusUpdate,
}
