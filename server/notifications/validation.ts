import type { Channel, SkipReason } from './types.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+\d{7,15}$/;

export function isValidEmail(v: string | null | undefined): boolean {
  return !!v && EMAIL_RE.test(v.trim());
}

export function isValidPhone(v: string | null | undefined): boolean {
  return !!v && E164_RE.test(v.trim());
}

/**
 * Convert an HTML body to a reasonable plain-text fallback for email
 * text/plain. Handles common block tags as line breaks, decodes a few
 * named entities, and collapses runs of whitespace.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderTemplate(
  tpl: string,
  vars: { shareUrl: string; eventName: string; eventNameSuffix: string }
): string {
  return tpl
    .replace(/\{shareUrl\}/g, vars.shareUrl)
    .replace(/\{eventName\}/g, vars.eventName)
    .replace(/\{eventNameSuffix\}/g, vars.eventNameSuffix);
}

export interface ChannelPlan {
  email: boolean;
  sms: boolean;
}

export function planChannels(
  channel: Channel,
  hasEmail: boolean,
  hasSms: boolean
): ChannelPlan | { skip: SkipReason } {
  switch (channel) {
    case 'email':
      if (!hasEmail) return { skip: 'channel-unavailable' };
      return { email: true, sms: false };
    case 'sms':
      if (!hasSms) return { skip: 'channel-unavailable' };
      return { email: false, sms: true };
    case 'both':
      if (!hasEmail && !hasSms) return { skip: 'no-contact' };
      return { email: hasEmail, sms: hasSms };
    case 'preferEmail':
      if (hasEmail) return { email: true, sms: false };
      if (hasSms) return { email: false, sms: true };
      return { skip: 'no-contact' };
    case 'preferSms':
      if (hasSms) return { email: false, sms: true };
      if (hasEmail) return { email: true, sms: false };
      return { skip: 'no-contact' };
  }
}
