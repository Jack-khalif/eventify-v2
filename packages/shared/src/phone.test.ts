import { describe, expect, it } from 'vitest';
import { normalizePhone, toDarajaMsisdn } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['0712 345 678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['+254 712 345 678', '+254712345678'],
    ['0110 123 456', '+254110123456'],
  ])('reads Kenyan %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('reads South Sudanese numbers', () => {
    expect(normalizePhone('+211 922 456 781')).toBe('+211922456781');
    expect(normalizePhone('0922456781', 'SS')).toBe('+211922456781');
  });

  it('rejects junk', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+254 812 345 678')).toBeNull();
  });
});

describe('toDarajaMsisdn', () => {
  it('strips the plus for Kenyan numbers only', () => {
    expect(toDarajaMsisdn('+254712345678')).toBe('254712345678');
    expect(toDarajaMsisdn('+211922456781')).toBeNull();
  });
});
