import { describe, expect, it } from 'vitest';
import { smsSegments, ticketSms } from './messages';

describe('ticketSms', () => {
  const sms = ticketSms({
    name: 'Amina Otieno',
    eventTitle: 'Sauti Sessions: Afro-house Listening Night',
    startsAt: '2026-10-02T19:00:00+03:00',
    code: 'EVT-SAUTI-4821',
    passUrl: 'eventify.co/t/Xq3v9LmN2pQ8rT5wY7zA1b',
  });

  it('uses the design’s wording with the first name', () => {
    expect(sms).toBe(
      "Hi Amina, you're confirmed for Sauti Sessions: Afro-house Listening Night on Fri 2 Oct. Ticket code EVT-SAUTI-4821. View your Live Pass: eventify.co/t/Xq3v9LmN2pQ8rT5wY7zA1b",
    );
  });

  it('stays in the cheap GSM-7 encoding', () => {
    expect(smsSegments(sms).encoding).toBe('GSM-7');
  });
});

describe('smsSegments', () => {
  it('fits 160 GSM-7 characters in one SMS and splits at 153 after that', () => {
    expect(smsSegments('a'.repeat(160))).toEqual({ encoding: 'GSM-7', length: 160, segments: 1 });
    expect(smsSegments('a'.repeat(161)).segments).toBe(2);
    expect(smsSegments('a'.repeat(306)).segments).toBe(2);
    expect(smsSegments('a'.repeat(307)).segments).toBe(3);
  });

  it('drops to 70 characters per SMS with an emoji or curly apostrophe', () => {
    expect(smsSegments('You’re in').encoding).toBe('UCS-2');
    expect(smsSegments('🎉'.repeat(71)).segments).toBe(2);
  });

  it('counts extended characters like € as two', () => {
    expect(smsSegments('€').length).toBe(2);
  });
});
