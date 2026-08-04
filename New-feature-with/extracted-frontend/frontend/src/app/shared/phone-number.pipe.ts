import { Pipe, PipeTransform } from '@angular/core';

/**
 * Strips any country-code prefix (e.g. "+91", "+1-") so MSISDNs
 * always render as a plain phone number, regardless of how they were stored.
 *
 * Rules:
 *  - If the value starts with "+" → strip "+" and 1-3 digits and any separator.
 *  - Else if there's an explicit separator ("-" or space) within the first 4 chars,
 *    strip everything up to and including that separator.
 *  - Otherwise the value is treated as an already-plain phone number: just remove
 *    non-digits and return it as-is (do NOT chop off the leading digits).
 *
 * Usage: {{ line.msisdn | phoneNumber }}
 */
@Pipe({ name: 'phoneNumber', standalone: true })
export class PhoneNumberPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const s = String(value).trim();

    // Case 1: explicit "+CC" prefix (with or without a separator).
    if (s.startsWith('+')) {
      const stripped = s.replace(/^\+\d{1,3}[-\s]?/, '');
      return stripped.replace(/\D/g, '') || s;
    }

    // Case 2: explicit separator early in the string (e.g. "91-9876543210").
    const sepMatch = s.match(/^\d{1,3}[-\s]/);
    if (sepMatch) {
      return s.slice(sepMatch[0].length).replace(/\D/g, '') || s;
    }

    // Case 3: plain digits — keep every digit.
    return s.replace(/\D/g, '') || s;
  }
}
