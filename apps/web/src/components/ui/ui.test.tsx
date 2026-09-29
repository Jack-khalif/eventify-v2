import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Chip, Dialog, Segmented, Stepper, TextField } from './index';

describe('Stepper', () => {
  function Controlled({ min = 1, max = 3 }: { min?: number; max?: number }) {
    const [v, setV] = useState(min);
    return <Stepper value={v} onChange={setV} min={min} max={max} />;
  }

  it('counts up and down within bounds', async () => {
    render(<Controlled />);
    const more = screen.getByRole('button', { name: 'More' });
    const fewer = screen.getByRole('button', { name: 'Fewer' });
    expect(fewer).toBeDisabled();

    await userEvent.click(more);
    await userEvent.click(more);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(more).toBeDisabled();

    await userEvent.click(fewer);
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });
});

describe('Chip', () => {
  it('exposes its active state to assistive tech', () => {
    render(
      <>
        <Chip active>Campus</Chip>
        <Chip>Corporate</Chip>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Campus' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Corporate' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Plain</Button>
      </form>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('TextField', () => {
  it('links label, error and invalid state', () => {
    render(<TextField label="Email" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email');
  });

  it('shows a hint when there is no error', () => {
    render(<TextField label="Phone" hint="We send your ticket here" />);
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription('We send your ticket here');
    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Segmented', () => {
  it('selects one option at a time', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Role"
        value="super"
        onChange={onChange}
        options={[
          { value: 'super', label: 'Super Admin' },
          { value: 'agent', label: 'Agent' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Super Admin' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Agent' }));
    expect(onChange).toHaveBeenCalledWith('agent');
  });
});

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Change fee rate">
        body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is labelled by its title and closes on Escape, the close button and the backdrop', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Change fee rate">
        body
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Change fee rate' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close when clicking inside the panel', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Change fee rate">
        body
      </Dialog>,
    );
    await userEvent.click(screen.getByText('body'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
