import { describe, it, expect } from 'vitest';
import { Money } from './money';

describe('Domain Accounting - Money Value Object', () => {
  it('instantiates correctly from minor units and major units', () => {
    const fromMinor = Money.fromMinor(10050, 'PKR');
    const fromMajor = Money.fromMajor(100.5, 'PKR');

    expect(fromMinor.minorUnits).toBe(10050);
    expect(fromMajor.minorUnits).toBe(10050);
  });

  it('rejects non-integer minor units to prevent float corruption', () => {
    expect(() => Money.fromMinor(10.55)).toThrow(/integer/);
  });

  it('performs exact addition and subtraction without floating-point artifacts', () => {
    // In standard JS: 0.1 + 0.2 === 0.30000000000000004
    const m1 = Money.fromMajor(0.1, 'PKR');
    const m2 = Money.fromMajor(0.2, 'PKR');
    const sum = m1.add(m2);

    expect(sum.minorUnits).toBe(30); // 0.30 PKR
    expect(sum.subtract(m1).minorUnits).toBe(20);
  });

  it('formats accurately with locale currency', () => {
    const money = Money.fromMajor(150000.5, 'PKR');
    const formatted = money.format('en-US');
    expect(formatted).toContain('150,000.50');
  });

  it('throws error when adding different currencies', () => {
    const pkr = Money.fromMinor(1000, 'PKR');
    const usd = Money.fromMinor(1000, 'USD');
    expect(() => pkr.add(usd)).toThrow(/mismatch/);
  });
});

