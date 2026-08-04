import { Pipe, PipeTransform } from '@angular/core';

/**
 * Strips any country-code prefix (e.g. "+91", "+1-") so MSISDNs
 * always render as a plain phone number, regardless of how they were stored.
 *
 * Usage: {{ line.msisdn | phoneNumber }}
 */
@Pipe({ name: 'phoneNumber', standalone: true })
export class PhoneNumberPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return value.replace(/^\+?\d{1,3}[-\s]?/, '').replace(/\D/g, '') || value;
  }
}
