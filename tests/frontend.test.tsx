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
  'HTMLButtonElement',
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
const { SetupPanel } = await import('../components/erp/setup');

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

void test('opening fees from a student keeps balances and payment options scoped to that student', async () => {
  const original = globalThis.fetch;
  const second = {
    ...view,
    students: [
      ...view.students,
      {
        id: 's2',
        name: 'Another Learner',
        classId: 'c1',
        roll: '2',
        effectiveOn: '2026-11-19',
      },
    ],
    charges: [
      ...view.charges,
      {
        id: 'charge-2',
        studentId: 's2',
        description: 'Other tuition',
        amount: 300000,
        paid: 0,
        dueOn: '2026-12-01',
      },
    ],
  };
  globalThis.fetch = async () => Response.json(second);
  try {
    render(<FeesPanel date="2026-11-19" initialStudentId="s1" />);
    const ledger = await screen.findByLabelText('Student ledger');
    assert.equal((ledger as unknown as HTMLSelectElement).value, 's1');
    const charge = () =>
      screen.getByLabelText(
        'Outstanding charge',
      ) as unknown as HTMLSelectElement;
    assert.equal(charge().options.length, 1);
    assert.equal(charge().value, 'charge-1');
    fireEvent.change(ledger, { target: { value: 's2' } });
    assert.equal(charge().options.length, 1);
    assert.equal(charge().value, 'charge-2');
    fireEvent.change(ledger, { target: { value: '' } });
    assert.equal(charge().options.length, 2);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('student register fee action passes the correct student identifier', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(view);
  let chosen = '';
  try {
    render(
      <AdmissionsPanel
        date="2026-11-19"
        onSaved={() => {}}
        onOpenFees={(id) => {
          chosen = id;
        }}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View fees for Fictional Learner',
      }),
    );
    assert.equal(chosen, 's1');
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('school setup uses task areas, keeps drafts, and saves a class into its register', async () => {
  const original = globalThis.fetch;
  let data = {
    schools: [{ id: 'school', name: 'School of Scholars', code: 'SOS-KATOL' }],
    classes: [],
    staff: [],
    assignments: [],
    enrolments: [],
    guardians: [],
  } as import('../lib/erp/model').Setup;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(
        typeof options.body === 'string' ? options.body : '{}',
      );
      assert.equal(body.action, 'class');
      assert.equal(body.grade, 'Class 6');
      data = {
        ...data,
        classes: [
          {
            id: 'class-6',
            schoolId: 'school',
            grade: body.grade,
            section: body.section,
          },
        ],
      };
    }
    return Response.json(data);
  };
  try {
    let opened = false;
    render(
      <SetupPanel
        date="2026-11-20"
        onSaved={() => {}}
        onOpenAdmissions={() => {
          opened = true;
        }}
      />,
    );
    await screen.findByRole('heading', { name: 'Classes & sections' });
    assert.equal(screen.queryByRole('heading', { name: 'School setup' }), null);
    const grade = screen.getByLabelText('Class') as HTMLInputElement;
    fireEvent.change(grade, { target: { value: 'Class 6' } });
    fireEvent.click(screen.getByRole('button', { name: 'User accounts' }));
    assert.ok(screen.getByRole('heading', { name: 'Create a user account' }));
    assert.equal(
      screen.queryByRole('heading', { name: 'Add class and section' }),
      null,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Classes & sections' }));
    assert.equal(grade.value, 'Class 6');
    fireEvent.change(screen.getByLabelText('Section'), {
      target: { value: 'A' },
    });
    fireEvent.submit(grade.closest('form')!);
    await screen.findByText('Configuration saved.');
    assert.ok(screen.getByRole('cell', { name: 'Class 6' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open student register' }),
    );
    assert.equal(opened, true);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
