import { describe, expect, it } from 'vitest';
import { attendeesCsv, maskPhone } from './attendees';
import type { Attendee } from './schemas';

const guest = (patch: Partial<Attendee>): Attendee => ({
  ticketId: 't1',
  code: 'EVT-SAUTI-0412',
  name: 'Amina Otieno',
  email: 'amina@example.com',
  phone: '+254712345678',
  tierName: 'Regular',
  kind: 'sale',
  checkedInAt: null,
  ...patch,
});

describe('attendeesCsv', () => {
  it('writes one row per ticket that Excel can open', () => {
    const csv = attendeesCsv(
      [
        guest({}),
        guest({
          name: 'Otieno, "DJ" Brian',
          kind: 'comp',
          phone: '',
          checkedInAt: '2026-10-02T19:10:00+03:00',
        }),
      ],
      () => '19:10',
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Name,Ticket code,Tier,Type,Email,Phone,Checked in',
      'Amina Otieno,EVT-SAUTI-0412,Regular,Bought,amina@example.com,+254 712 345 678,',
      '"Otieno, ""DJ"" Brian",EVT-SAUTI-0412,Regular,Complimentary,amina@example.com,,19:10',
      '',
    ]);
  });

  it('keeps a guest’s name from running as a spreadsheet formula', () => {
    const csv = attendeesCsv([guest({ name: '=HYPERLINK("x")' })], () => '');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('maskPhone', () => {
  it('shows the last three digits only', () => {
    expect(maskPhone('+254712345678')).toBe('•••• 678');
    expect(maskPhone('')).toBe('');
  });
});
