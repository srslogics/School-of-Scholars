import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
const window = new Window({ url: 'http://localhost/' });
for (const key of [
  'window',
  'document',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'Node',
  'MutationObserver',
  'Event',
  'KeyboardEvent',
])
  Object.defineProperty(globalThis, key, {
    value: (window as unknown as Record<string, unknown>)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, 'FormData', {
  value: window.FormData,
  configurable: true,
});
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, waitFor, cleanup } =
  await import('@testing-library/react');
const { AdmissionsPanel } = await import('../components/erp/admissions');
const { FeesPanel } = await import('../components/erp/fees');

const view = {
  classes: [{ id: 'c1', label: 'Class 5 / A' }],
  students: [
    {
      id: 's1',
      name: 'Fictional Learner',
      classId: 'c1',
      roll: '1',
      effectiveOn: '2026-11-19',
    },
  ],
  charges: [
    {
      id: 'charge-1',
      studentId: 's1',
      description: 'Tuition',
      amount: 100000,
      paid: 0,
      dueOn: '2026-12-01',
    },
  ],
  receipts: [],
};

void test('student search communicates empty results and saving locks admission inputs', async () => {
  const original = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = async (_url, options) =>
    options?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json(view);
  try {
    render(<AdmissionsPanel date="2026-11-19" onSaved={() => {}} />);
    const search = await screen.findByRole('searchbox', {
      name: 'Search students',
    });
    fireEvent.change(search, { target: { value: 'does not exist' } });
    assert.ok(screen.getByText('No students match your search.'));
    fireEvent.change(search, { target: { value: 'Fictional' } });
    assert.ok(screen.getByText('Fictional Learner'));
    const name = screen.getByLabelText('Student name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'New Learner' } });
    fireEvent.change(screen.getByLabelText('Class roll number'), {
      target: { value: '2' },
    });
    fireEvent.submit(name.closest('form')!);
    await waitFor(() =>
      assert.ok(
        screen
          .getByRole('button', { name: 'Saving…' })
          .hasAttribute('disabled'),
      ),
    );
    assert.equal(name.closest('fieldset')!.disabled, true);
    release!(Response.json(view));
    await screen.findByText(/Student admitted\./);
    assert.equal(name.closest('fieldset')!.disabled, false);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('fee collection requires noncash references and gives explicit empty ledger feedback', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(view);
  try {
    render(<FeesPanel date="2026-11-19" />);
    const mode = await screen.findByLabelText('Payment mode');
    const reference = screen.getByLabelText(
      'Transaction reference (optional)',
    ) as HTMLInputElement;
    assert.equal(reference.required, false);
    fireEvent.change(mode, { target: { value: 'upi' } });
    assert.equal(
      (
        screen.getByLabelText(
          'Transaction reference (required)',
        ) as HTMLInputElement
      ).required,
      true,
    );
    assert.ok(
      screen.getByText(
        'No collections recorded. Saved receipts appear here after a payment.',
      ),
    );
    assert.ok(
      screen
        .getByRole('region', { name: 'Collection receipts' })
        .hasAttribute('tabindex'),
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
