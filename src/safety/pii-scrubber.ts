import { getConfig } from '../config.js';

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_INDIAN_REGEX = /\b(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const PHONE_INTL_REGEX = /\b\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;
const URL_REGEX = /https?:\/\/\S+/gi;

export function scrubPII(text: string): { scrubbed: string; redactions: number } {
  const config = getConfig();
  if (!config.safety.piiScrubEnabled) {
    return { scrubbed: text, redactions: 0 };
  }

  let redactions = 0;
  let scrubbed = text;

  const replaceAndCount = (regex: RegExp) => {
    let count = 0;
    scrubbed = scrubbed.replace(regex, () => {
      count++;
      return '[REDACTED]';
    });
    redactions += count;
  };

  replaceAndCount(EMAIL_REGEX);
  replaceAndCount(PHONE_INDIAN_REGEX);
  replaceAndCount(PHONE_INTL_REGEX);
  replaceAndCount(URL_REGEX);

  return { scrubbed, redactions };
}
