import { CAMPAIGN_CHANNELS, CampaignChannel } from '../src/types/campaign';

export class ApiError extends Error {
  status: number;
  code: string;
  details: string[];

  constructor(message: string, status = 400, code = 'invalid_request', details: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function assertDocumentId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DOCUMENT_ID_PATTERN.test(value)) {
    throw new ApiError(`${field} is not a valid document id`, 400, 'invalid_id');
  }
  return value;
}

export function requireString(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; required?: boolean } = {}
): string {
  const { min = 1, max = 4000, required = true } = opts;
  if (value === undefined || value === null || value === '') {
    if (!required) return '';
    throw new ApiError(`${field} is required`, 400, 'validation_failed', [`${field} is required`]);
  }
  if (typeof value !== 'string') {
    throw new ApiError(`${field} must be a string`, 400, 'validation_failed', [`${field} must be a string`]);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ApiError(`${field} must be at least ${min} characters`, 400, 'validation_failed');
  }
  if (trimmed.length > max) {
    throw new ApiError(`${field} must be at most ${max} characters`, 400, 'validation_failed');
  }
  return trimmed;
}

export function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(`${field} is required`, 400, 'validation_failed', [`${field} is required`]);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(`${field} is not a valid date`, 400, 'invalid_date', [`${field} is not a valid date`]);
  }
  return parsed;
}

export function assertDateRange(startValue: unknown, endValue: unknown): { startDate: string; endDate: string } {
  const start = parseIsoDate(startValue, 'startDate');
  const end = parseIsoDate(endValue, 'endDate');
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(
      'End date must be after the start date',
      400,
      'invalid_date_range',
      ['End date must be after the start date']
    );
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function parseChannels(value: unknown): CampaignChannel[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError('At least one publishing channel is required', 400, 'validation_failed', [
      'channels must contain at least one channel',
    ]);
  }
  const channels: CampaignChannel[] = [];
  for (const entry of value) {
    const channel = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
    if (!CAMPAIGN_CHANNELS.includes(channel as CampaignChannel)) {
      throw new ApiError(
        `Unsupported channel "${String(entry)}". Allowed: ${CAMPAIGN_CHANNELS.join(', ')}`,
        400,
        'invalid_channel'
      );
    }
    if (!channels.includes(channel as CampaignChannel)) channels.push(channel as CampaignChannel);
  }
  return channels;
}

const CAMPAIGN_STATUSES = ['draft', 'in_review', 'approved', 'released', 'archived'] as const;
export type CampaignStatusInput = (typeof CAMPAIGN_STATUSES)[number];

export function parseCampaignStatus(value: unknown, fallback: CampaignStatusInput = 'draft'): CampaignStatusInput {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !CAMPAIGN_STATUSES.includes(value as CampaignStatusInput)) {
    throw new ApiError(
      `status must be one of ${CAMPAIGN_STATUSES.join(', ')}`,
      400,
      'invalid_status'
    );
  }
  return value as CampaignStatusInput;
}

export function parseEvidenceIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ApiError('evidenceIds must be an array of document ids', 400, 'validation_failed');
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !DOCUMENT_ID_PATTERN.test(entry)) {
      throw new ApiError('evidenceIds contains an invalid document id', 400, 'validation_failed');
    }
    if (!ids.includes(entry)) ids.push(entry);
  }
  if (ids.length > 20) {
    throw new ApiError('An asset may reference at most 20 evidence records', 400, 'validation_failed');
  }
  return ids;
}
