/**
 * Pure Domain Money Value Object & Calculations
 * Operates strictly with 64-bit integer minor currency units (cents / paisa).
 * Prevents IEEE-754 floating point rounding drift.
 */

export class Money {
  readonly minorUnits: number;
  readonly currency: string;

  private constructor(minorUnits: number, currency: string = 'PKR') {
    if (!Number.isInteger(minorUnits)) {
      throw new Error(`[Money] Minor units must be an integer. Received: ${minorUnits}`);
    }
    this.minorUnits = minorUnits;
    this.currency = currency;
  }

  static fromMinor(minorUnits: number, currency: string = 'PKR'): Money {
    return new Money(minorUnits, currency);
  }

  static fromMajor(majorUnits: number, currency: string = 'PKR'): Money {
    const minor = Math.round(majorUnits * 100);
    return new Money(minor, currency);
  }

  static zero(currency: string = 'PKR'): Money {
    return new Money(0, currency);
  }

  static format(minorUnits: number, currency: string = 'PKR', locale: string = 'en-PK'): string {
    return Money.fromMinor(minorUnits, currency).format(locale);
  }

  add(other: Money): Money {
    this.assertMatchingCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertMatchingCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.minorUnits * factor), this.currency);
  }

  isPositive(): boolean {
    return this.minorUnits > 0;
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  format(locale: string = 'en-PK'): string {
    const major = this.minorUnits / 100;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  }

  private assertMatchingCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`[Money] Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

