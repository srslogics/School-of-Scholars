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
      items: [{ id: 'setup', label: 'Classes & access' }],
    });
  if (['administrator', 'principal', 'officer'].includes(role)) {
    groups.push({
      label: 'Students',
      items: [{ id: 'admissions', label: 'Admissions & register' }],
    });
    groups.push({
      label: 'Finance',
      items: [{ id: 'fees', label: 'Fees & collections' }],
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
      items: [
        {
          id: 'requests',
          label: role === 'teacher' ? 'My requests' : 'School requests',
        },
      ],
    });
  groups.push({
    label: 'Communication',
    items: [{ id: 'communication', label: 'Notices' }],
  });
  return groups;
}
