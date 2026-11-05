import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('Phase 1 Foundation Smoke Tests', () => {
  it('renders top navigation and bottom navigation with Glisse liquid glass UI', () => {
    render(<App />);
    expect(screen.getByText('Financial Overview')).toBeInTheDocument();
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contacts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Accounts').length).toBeGreaterThan(0);
  });
});
