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
const { AcademicPanel } = await import('../components/erp/academics');
const { PortalWorkspace } = await import('../components/erp/portal-workspace');
const { PortalPanel } = await import('../components/erp/portals');

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
    fireEvent.click(screen.getByRole('button', { name: 'Receipts' }));
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

void test('staff request queue shows the chosen record and filters completed decisions', async () => {
  const original = globalThis.fetch;
  const requests = [
    {
      id: 'r1',
      schoolId: 'school',
      studentId: null,
      studentName: null,
      accountId: 'staff',
      kind: 'leave',
      requestedOn: '2026-11-20',
      message: 'First leave details',
      status: 'submitted',
      createdAt: '2026-11-20T10:00:00Z',
      owner: 'Staff Member',
    },
    {
      id: 'r2',
      schoolId: 'school',
      studentId: null,
      studentName: null,
      accountId: 'staff',
      kind: 'service',
      requestedOn: '2026-11-21',
      message: 'Second service details',
      status: 'approved',
      createdAt: '2026-11-20T11:00:00Z',
      owner: 'Staff Member',
    },
  ];
  globalThis.fetch = async () =>
    Response.json({
      date: '2026-11-20',
      children: [],
      schools: [
        { id: 'school', code: 'SOS-KATOL', name: 'School of Scholars' },
      ],
      requests,
      history: [],
      canReview: false,
    });
  try {
    render(
      <PortalPanel
        account={{
          id: 'staff',
          username: 'staff',
          name: 'Staff Member',
          role: 'staff',
        }}
        date="2026-11-20"
      />,
    );
    await screen.findByRole('button', { name: /Leave · 2026-11-20/ });
    const first = screen.getByText('First leave details');
    assert.equal(first.closest('article')!.hidden, false);
    fireEvent.click(
      screen.getByRole('button', { name: /Campus service · 2026-11-21/ }),
    );
    assert.equal(first.closest('article')!.hidden, true);
    assert.equal(
      screen.getByText('Second service details').closest('article')!.hidden,
      false,
    );
    fireEvent.change(screen.getByLabelText('Request status'), {
      target: { value: 'approved' },
    });
    assert.equal(
      screen.queryByRole('button', { name: /Leave · 2026-11-20/ }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('parent child switch updates the visible child and the leave-request target together', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      date: '2026-11-20',
      schools: [],
      requests: [],
      history: [],
      canReview: false,
      children: [
        {
          id: 's1',
          name: 'First Child',
          roll: '1',
          schoolId: 'school',
          school: 'School of Scholars',
          className: '5 / A',
          attendance: null,
          charges: [],
          receipts: [],
        },
        {
          id: 's2',
          name: 'Second Child',
          roll: '2',
          schoolId: 'school',
          school: 'School of Scholars',
          className: '6 / A',
          attendance: { mark: 'present', status: 'submitted' },
          charges: [],
          receipts: [],
        },
      ],
    });
  try {
    render(
      <PortalPanel
        account={{
          id: 'parent',
          username: 'parent',
          name: 'Guardian',
          role: 'parent',
        }}
        date="2026-11-20"
      />,
    );
    await screen.findByRole('heading', { name: 'First Child' });
    const childSelects = screen.getAllByLabelText('Child');
    fireEvent.change(childSelects[0], { target: { value: 's2' } });
    assert.equal(screen.queryByRole('heading', { name: 'First Child' }), null);
    assert.ok(screen.getByRole('heading', { name: 'Second Child' }));
    assert.equal(
      (screen.getAllByLabelText('Child')[1] as unknown as HTMLSelectElement)
        .value,
      's2',
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('parent report cards show zero marks and expose no mark-entry or publication controls', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      classes: [{ id: 'c', schoolId: 'school', grade: '5', section: 'A' }],
      students: [
        { id: 'child', name: 'Fictional Child', classId: 'c', roll: '1' },
      ],
      schools: ['school'],
      teachers: [],
      timetable: [],
      homework: [],
      notices: [],
      exams: [
        {
          id: 'exam',
          classId: 'c',
          title: 'Term 1',
          subject: 'Mathematics',
          examOn: '2026-11-20',
          maxScore: 100,
          status: 'published',
        },
      ],
      results: [{ examId: 'exam', studentId: 'child', score: 0 }],
      examRoster: [{ examId: 'exam', studentId: 'child' }],
      canSchedule: false,
      canTeach: false,
      canPublish: false,
    });
  try {
    render(
      <AcademicPanel
        account={{
          id: 'parent',
          username: 'parent',
          name: 'Parent',
          role: 'parent',
        }}
        initialArea="reports"
      />,
    );
    await screen.findByRole('row', { name: 'Mathematics 0 100' });
    assert.ok(screen.getByRole('row', { name: 'Total 0 100' }));
    assert.equal(screen.queryByRole('button', { name: 'Save marks' }), null);
    assert.equal(
      screen.queryByRole('button', { name: 'Approve and publish results' }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('unlinked parents get one access message without unusable attendance or request controls', async () => {
  const original = globalThis.fetch;
  let linked = false;
  const availability: boolean[] = [];
  globalThis.fetch = async () =>
    Response.json({
      date: '2026-11-20',
      schools: [],
      requests: [],
      history: [],
      canReview: false,
      children: linked
        ? [
            {
              id: 'child',
              name: 'Linked Child',
              roll: '1',
              schoolId: 'school',
              school: 'School of Scholars',
              className: '5 · A',
              attendance: null,
              charges: [],
              receipts: [],
            },
          ]
        : [],
    });
  try {
    render(
      <PortalPanel
        account={{
          id: 'parent',
          username: 'parent',
          name: 'Guardian',
          role: 'parent',
        }}
        date="2026-11-20"
        onHasChildren={(value) => availability.push(value)}
      />,
    );
    await screen.findByRole('heading', { name: 'No child linked' });
    assert.equal(screen.queryByLabelText('Attendance date'), null);
    assert.equal(screen.queryByLabelText('Request status'), null);
    assert.equal(screen.queryByText('Request leave for a child'), null);
    assert.equal(
      screen.queryByText(
        'Select a request to view its details and decision history.',
      ),
      null,
    );
    assert.equal(availability.at(-1), false);
    linked = true;
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByRole('heading', { name: 'Linked Child' });
    assert.equal(availability.at(-1), true);
    assert.ok(screen.getByLabelText('Attendance date'));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('empty staff requests have one empty-state line without an empty detail pane', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      date: '2026-11-20',
      schools: [
        { id: 'school', name: 'School of Scholars', code: 'SOS-KATOL' },
      ],
      children: [],
      requests: [],
      history: [],
      canReview: false,
    });
  try {
    render(
      <PortalPanel
        account={{
          id: 'staff',
          username: 'staff',
          name: 'Staff',
          role: 'staff',
        }}
        date="2026-11-20"
      />,
    );
    await screen.findByText('No requests in this view.');
    assert.equal(
      screen.queryByRole('navigation', { name: 'Request list' }),
      null,
    );
    assert.equal(
      screen.queryByText(
        'Select a request to view its details and decision history.',
      ),
      null,
    );
    assert.ok(screen.getByText('Submit a request'));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('parent modules remain discoverable without a link and become functional after linking', async () => {
  const original = globalThis.fetch;
  const parent = {
    id: 'parent',
    username: 'parent',
    name: 'Guardian',
    role: 'parent' as const,
  };
  globalThis.fetch = async () =>
    Response.json({
      date: '2026-11-20',
      schools: [],
      requests: [],
      history: [],
      children: [],
      canReview: false,
    });
  try {
    render(<PortalPanel account={parent} date="2026-11-20" />);
    await screen.findByRole('heading', { name: 'No child linked' });
    for (const name of [
      'Attendance',
      'Fees',
      'Receipts',
      'Leave',
      'Requests',
      'History',
    ])
      assert.ok(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Fees' }));
    assert.ok(screen.getByRole('heading', { name: 'No child linked' }));
    cleanup();
    const data = {
      date: '2026-11-20',
      schools: [],
      canReview: false,
      children: [
        {
          id: 'child',
          name: 'Linked Child',
          roll: '1',
          schoolId: 'school',
          school: 'School of Scholars',
          className: '5 · A',
          attendance: { mark: 'present', status: 'submitted' },
          charges: [
            {
              id: 'fee',
              description: 'Tuition',
              amount: 100000,
              paid: 25000,
              dueOn: '2026-12-01',
            },
          ],
          receipts: [
            { id: 'R-001', amount: 25000, paidOn: '2026-11-20', mode: 'cash' },
          ],
        },
      ],
      requests: [
        {
          id: 'leave',
          schoolId: 'school',
          studentId: 'child',
          studentName: 'Linked Child',
          kind: 'leave',
          requestedOn: '2026-11-20',
          message: 'Family appointment',
          status: 'submitted',
          createdAt: '2026-11-20T10:00:00Z',
          owner: 'Guardian',
          accountId: 'parent',
        },
      ],
      history: [
        {
          requestId: 'leave',
          actor: 'Guardian',
          action: 'submitted',
          note: 'Family appointment',
          at: '2026-11-20T10:00:00Z',
        },
      ],
    };
    let submitted: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, options) => {
      if (options?.method === 'POST')
        submitted = JSON.parse(
          typeof options.body === 'string' ? options.body : '{}',
        ) as Record<string, unknown>;
      return Response.json(data);
    };
    render(<PortalPanel account={parent} date="2026-11-20" />);
    await screen.findByRole('heading', { name: 'Linked Child' });
    assert.ok(screen.getByText('Present'));
    fireEvent.click(screen.getByRole('button', { name: 'Fees' }));
    assert.ok(screen.getByRole('heading', { level: 2, name: 'Fees' }));
    fireEvent.click(screen.getByRole('button', { name: 'Receipts' }));
    assert.ok(screen.getByRole('heading', { level: 2, name: 'Receipts' }));
    assert.ok(screen.getByText('R-001'));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    const details = screen.getByLabelText('Details');
    fireEvent.change(details, { target: { value: 'Family appointment' } });
    fireEvent.submit(details.closest('form')!);
    await screen.findByText('Request submitted to the school.');
    assert.equal(submitted?.studentId, 'child');
    assert.ok(screen.getByRole('heading', { level: 2, name: 'Requests' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    assert.equal(
      screen.getByText('View history').closest('details')!.open,
      true,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('unlinked parents can open communication while learning records still require a child link', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      classes: [],
      students: [],
      schools: ['school'],
      teachers: [],
      timetable: [],
      homework: [],
      exams: [],
      results: [],
      examRoster: [],
      notices: [
        {
          id: 'notice',
          schoolId: 'school',
          classId: null,
          title: 'School announcement',
          message: 'School-wide update',
          author: 'Principal',
          createdAt: '2026-11-20T10:00:00Z',
          readAt: null,
        },
      ],
      canSchedule: false,
      canTeach: false,
      canPublish: false,
    });
  try {
    render(
      <AcademicPanel
        account={{
          id: 'parent',
          username: 'parent',
          name: 'Guardian',
          role: 'parent',
        }}
      />,
    );
    await screen.findByRole('heading', { name: 'No child linked' });
    const communication = screen.getByRole('button', { name: 'Communication' });
    assert.equal(communication.hasAttribute('disabled'), false);
    fireEvent.click(communication);
    assert.ok(screen.getByRole('heading', { name: 'School announcement' }));
    assert.equal(
      screen.queryByRole('heading', { name: 'No child linked' }),
      null,
    );
    assert.ok(screen.getByRole('button', { name: 'Mark as read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Homework' }));
    assert.ok(screen.getByRole('heading', { name: 'No child linked' }));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

void test('parent sidebar groups expose child modules and notices without duplicate top menus', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    Response.json(
      typeof url === 'string' && url.includes('academics')
        ? {
            classes: [],
            students: [],
            schools: ['school'],
            teachers: [],
            timetable: [],
            homework: [],
            exams: [],
            results: [],
            examRoster: [],
            notices: [
              {
                id: 'n',
                schoolId: 'school',
                classId: null,
                title: 'School announcement',
                message: 'School notice',
                author: 'Principal',
                createdAt: '2026-11-20T10:00:00Z',
                readAt: null,
              },
            ],
            canSchedule: false,
            canTeach: false,
            canPublish: false,
          }
        : {
            date: '2026-11-20',
            schools: [],
            children: [],
            requests: [],
            history: [],
            canReview: false,
          },
    );
  try {
    render(
      <PortalWorkspace
        workspace={{
          account: {
            id: 'parent',
            username: 'parent',
            name: 'Guardian',
            role: 'parent',
          },
          date: '2026-11-20',
          schools: [],
          classes: [],
        }}
      />,
    );
    await screen.findByRole('heading', { name: 'No child linked' });
    assert.ok(screen.getByRole('navigation', { name: 'App navigation' }));
    assert.equal(
      screen.queryByRole('navigation', { name: 'Parent modules' }),
      null,
    );
    fireEvent.click(screen.getByText('Fees', { selector: 'summary' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Fee statement' }),
    );
    assert.ok(screen.getByRole('heading', { level: 1, name: 'Fee statement' }));
    assert.ok(screen.getByRole('heading', { name: 'No child linked' }));
    fireEvent.click(screen.getByText('Communication', { selector: 'summary' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'School & class notices' }),
    );
    await screen.findByRole('heading', { name: 'School announcement' });
    assert.equal(
      screen.queryByRole('navigation', { name: 'Academic module' }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
