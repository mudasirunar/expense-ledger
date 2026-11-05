import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('Phase 1 Foundation Smoke Tests', () => {
  it('renders top navigation and bottom navigation', () => {
    render(<App />);
    expect(screen.getByText(/Financial Overview/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Projects/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contacts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Accounts/i)).toBeInTheDocument();
  });
});

