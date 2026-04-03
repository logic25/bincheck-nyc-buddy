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

export const TEMPLATES: Record<string, TemplateEntry> = {
  'report-ready': reportReady,
  'gle-lead-notification': gleLeadNotification,
  'client-request-confirmation': clientRequestConfirmation,
}
