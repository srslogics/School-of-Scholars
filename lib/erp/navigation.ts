import type { Role } from './model';
export type NavigationGroup = {
  label: string;
  items: { id: string; label: string }[];
};
const academicItems = [
  { id: 'timetable', label: 'Timetable' },
  { id: 'homework', label: 'Homework' },
  { id: 'exams', label: 'Examinations' },
  { id: 'reports', label: 'Report cards' },
  { id: 'communication', label: 'Notices' },
];
export function appNavigation(role: Role): NavigationGroup[] {
  if (role === 'parent')
    return [
      {
        label: 'My child',
        items: [{ id: 'daily:attendance', label: 'Attendance' }],
      },
      {
        label: 'Fees',
        items: [
          { id: 'daily:fees', label: 'Fee statement' },
          { id: 'daily:receipts', label: 'Receipts' },
        ],
      },
      {
        label: 'Academics',
        items: academicItems
          .filter((i) => i.id !== 'communication')
          .map((i) => ({ ...i, id: 'academic:' + i.id })),
      },
      {
        label: 'Requests',
        items: [
          { id: 'daily:leave', label: 'Request leave' },
          { id: 'daily:requests', label: 'Request status' },
          { id: 'daily:history', label: 'History' },
        ],
      },
      {
        label: 'Communication',
        items: [
          { id: 'academic:communication', label: 'School & class notices' },
        ],
      },
    ];
  if (role === 'staff')
    return [
      {
        label: 'My work',
        items: [
          { id: 'daily:requests', label: 'My requests' },
          { id: 'daily:history', label: 'Request history' },
        ],
      },
      {
        label: 'Communication',
        items: [{ id: 'academic:communication', label: 'School notices' }],
      },
    ];
  const groups: NavigationGroup[] = [];
  if (role === 'administrator')
    groups.push({
      label: 'Administration',
      items: [
        { id: 'setup:classes', label: 'Classes & sections' },
        { id: 'setup:users', label: 'User accounts' },
        { id: 'setup:assignments', label: 'Staff access' },
        { id: 'setup:guardians', label: 'Guardian links' },
      ],
    });
  if (['administrator', 'principal', 'officer'].includes(role)) {
    groups.push({
      label: 'Students',
      items: [{ id: 'admissions', label: 'Admissions & register' }],
    });
    groups.push({
      label: 'Finance',
      items: [
        { id: 'fees:balances', label: 'Student balances' },
        { id: 'fees:receipts', label: 'Receipts' },
        { id: 'fees:payment', label: 'Collect payment' },
        { id: 'fees:charge', label: 'Add charge' },
      ],
    });
  }
  if (['teacher', 'principal'].includes(role))
    groups.push({
      label: 'Attendance',
      items: [
        { id: 'register', label: 'Class register' },
        ...(role === 'principal'
          ? [{ id: 'report', label: 'Submission reports' }]
          : []),
      ],
    });
  if (role === 'officer')
    groups.push({
      label: 'Attendance',
      items: [{ id: 'report', label: 'Submission reports' }],
    });
  if (['administrator', 'principal', 'teacher'].includes(role))
    groups.push({
      label: 'Academics',
      items: academicItems.filter((i) => i.id !== 'communication'),
    });
  if (['administrator', 'principal', 'teacher'].includes(role))
    groups.push({
      label: 'Requests',
      items:
        role === 'teacher'
          ? [
              { id: 'requests', label: 'My requests' },
              { id: 'requests:history', label: 'Request history' },
            ]
          : [
              { id: 'requests', label: 'School requests' },
              { id: 'requests:history', label: 'Decision history' },
            ],
    });
  groups.push({
    label: 'Communication',
    items: [{ id: 'communication', label: 'Notices' }],
  });
  return groups;
}
