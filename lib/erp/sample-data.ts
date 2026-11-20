import { many, one, run, write, type Database } from './database';
import { type Account, todayInNagpur } from './model';
import { ErpError } from './validation';

const prefix = 'sos-sample-v1-';
export async function loadSampleData(db: Database, actor: Account) {
  if (actor.role !== 'administrator')
    throw new ErpError(
      403,
      'Only the school administrator can load sample data.',
    );
  return write(db, async (tx) => {
    await run(
      tx,
      'CREATE TABLE IF NOT EXISTS sample_data_run (id TEXT PRIMARY KEY, loaded_on TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES account(id))',
    );
    const prior = await one<{ loaded_on: string }>(
      tx,
      'SELECT loaded_on FROM sample_data_run WHERE id=?',
      prefix,
    );
    if (prior) return { loadedOn: prior.loaded_on, alreadyLoaded: true };
    const school = await one<{ id: string }>(
      tx,
      "SELECT id FROM school WHERE code='SOS-KATOL'",
    );
    if (!school) throw new ErpError(409, 'Configure the Katol campus first.');
    const accounts = await many<Account>(
      tx,
      'SELECT a.id,a.username,a.name,COALESCE(p.role,a.role) AS role FROM account a LEFT JOIN portal_profile p ON p.account_id=a.id',
    );
    const find = (role: string) => accounts.find((a) => a.role === role);
    const teacher = find('teacher'),
      principal = find('principal'),
      parent = find('parent'),
      staff = find('staff'),
      office = find('officer');
    if (!teacher || !principal || !parent || !staff || !office)
      throw new ErpError(
        409,
        'Create faculty, principal, parent, staff and school-office accounts before loading sample data.',
      );
    const date = todayInNagpur(),
      at = new Date().toISOString();
    const future = new Date(date + 'T00:00:00Z');
    future.setUTCDate(future.getUTCDate() + 7);
    const due = future.toISOString().slice(0, 10);
    const event = async (recordId: string, action: string, by = actor.id) =>
      run(
        tx,
        'INSERT INTO academic_event VALUES (?,?,?,?,?,?)',
        prefix + action + '-' + recordId,
        recordId,
        by,
        action,
        JSON.stringify({ sample: true }),
        at,
      );
    for (const person of [principal, staff, office])
      await run(
        tx,
        'INSERT INTO school_assignment VALUES (?,?) ON CONFLICT DO NOTHING',
        person.id,
        school.id,
      );
    const classRows = [
      { grade: 'Sample 5', section: 'A', count: 4 },
      { grade: 'Sample 6', section: 'A', count: 3 },
      { grade: 'Sample 7', section: 'B', count: 2 },
    ];
    for (const [index, section] of classRows.entries()) {
      const classId = prefix + 'class-' + index;
      // Reserved sample classes never alter existing class sections.
      if (
        await one(
          tx,
          'SELECT id FROM class_section WHERE school_id=? AND grade=? AND section=?',
          school.id,
          section.grade,
          section.section,
        )
      )
        throw new ErpError(
          409,
          'A reserved sample class already exists. No sample data was added.',
        );
      await run(
        tx,
        'INSERT INTO class_section VALUES (?,?,?,?,?)',
        classId,
        school.id,
        section.grade,
        section.section,
        date,
      );
      await run(
        tx,
        'INSERT INTO class_assignment VALUES (?,?)',
        teacher.id,
        classId,
      );
      const students = [];
      for (let n = 1; n <= section.count; n++) {
        const id = prefix + 'student-' + index + '-' + n,
          name = 'Fictional Learner ' + (index + 1) + '-' + n;
        students.push({
          id,
          name,
          roll: String(n),
          mark: n === section.count ? 'leave' : 'present',
        });
        await run(
          tx,
          'INSERT INTO enrolment VALUES (?,?,?,?,?)',
          id,
          classId,
          name,
          String(n),
          date,
        );
        await run(
          tx,
          'INSERT INTO admission_event VALUES (?,?,?,?)',
          id,
          office.id,
          at,
          'admitted',
        );
        if (n === 1) {
          await run(
            tx,
            'INSERT INTO guardian_link VALUES (?,?)',
            parent.id,
            id,
          );
          await run(
            tx,
            'INSERT INTO guardian_event VALUES (?,?,?,?,?,?)',
            prefix + 'guardian-' + index,
            parent.id,
            id,
            actor.id,
            'linked',
            at,
          );
        }
        const chargeId = prefix + 'charge-' + index + '-' + n;
        await run(
          tx,
          'INSERT INTO fee_charge VALUES (?,?,?,?,?,?,?,?,?)',
          chargeId,
          id,
          'Fictional tuition instalment',
          240000,
          due,
          office.id,
          at,
          chargeId,
          JSON.stringify({ sample: true }),
        );
        if (n <= 2)
          await run(
            tx,
            'INSERT INTO fee_receipt VALUES (?,?,?,?,?,?,?,?,?,?)',
            prefix + 'receipt-' + index + '-' + n,
            chargeId,
            n === 1 ? 100000 : 240000,
            'cash',
            '',
            date,
            office.id,
            at,
            prefix + 'payment-' + index + '-' + n,
            JSON.stringify({ sample: true }),
          );
      }
      if (index < 2) {
        const registerId = prefix + 'register-' + index,
          entries = JSON.stringify(students),
          status = index === 0 ? 'reviewed' : 'returned';
        await run(
          tx,
          'INSERT INTO register VALUES (?,?,?,?,?,?)',
          registerId,
          classId,
          date,
          status,
          2,
          entries,
        );
        await run(
          tx,
          'INSERT INTO register_event VALUES (?,?,?,?,?,?,?,?,?)',
          registerId,
          1,
          teacher.id,
          teacher.name,
          'submitted',
          at,
          'Fictional sample register',
          students.length,
          entries,
        );
        await run(
          tx,
          'INSERT INTO register_event VALUES (?,?,?,?,?,?,?,?,?)',
          registerId,
          2,
          principal.id,
          principal.name,
          index === 0 ? 'reviewed' : 'returned',
          at,
          index === 0
            ? 'Sample review complete'
            : 'Sample correction requested: verify the leave entry.',
          0,
          entries,
        );
      }

      const starts = String(15 + index).padStart(2, '0') + ':00',
        ends = String(15 + index).padStart(2, '0') + ':40';
      if (
        await one(
          tx,
          'SELECT id FROM academic_slot WHERE teacher_id=? AND weekday=7 AND starts<? AND ends>?',
          teacher.id,
          ends,
          starts,
        )
      )
        throw new ErpError(
          409,
          'The sample timetable would conflict with an existing Sunday period. No sample records were added.',
        );
      await run(
        tx,
        'INSERT INTO academic_slot VALUES (?,?,?,?,?,?,?)',
        prefix + 'slot-' + index,
        classId,
        teacher.id,
        7,
        starts,
        ends,
        'Mathematics',
      );
      await event(prefix + 'slot-' + index, 'slot', actor.id);
      await run(
        tx,
        'INSERT INTO academic_homework VALUES (?,?,?,?,?,?,?,?)',
        prefix + 'homework-' + index,
        classId,
        'English',
        'Fictional reading practice',
        'Read a short passage and write three sentences about it.',
        due,
        teacher.id,
        at,
      );
      await event(prefix + 'homework-' + index, 'homework', teacher.id);
      for (const [paperIndex, subject] of [
        'Mathematics',
        'English',
      ].entries()) {
        const examId = prefix + 'exam-' + index + '-' + paperIndex,
          published = index === 0;
        await run(
          tx,
          'INSERT INTO academic_exam VALUES (?,?,?,?,?,?,?,?)',
          examId,
          classId,
          'Sample Term 1',
          subject,
          date,
          100,
          published ? 'published' : 'draft',
          teacher.id,
        );
        for (const [n, student] of students.entries()) {
          await run(
            tx,
            'INSERT INTO academic_exam_student VALUES (?,?)',
            examId,
            student.id,
          );
          if (published || n === 0)
            await run(
              tx,
              'INSERT INTO academic_mark VALUES (?,?,?,?,?)',
              examId,
              student.id,
              78 + n * 3 + paperIndex,
              teacher.id,
              at,
            );
        }
        await event(examId, 'exam', teacher.id);
        if (published) await event(examId, 'publish', principal.id);
      }
      await run(
        tx,
        'INSERT INTO academic_notice VALUES (?,?,?,?,?,?,?)',
        prefix + 'notice-' + index,
        school.id,
        classId,
        'Fictional class update',
        'Sample class activity: bring a notebook for reading practice.',
        teacher.id,
        at,
      );
      await event(prefix + 'notice-' + index, 'notice', teacher.id);
    }
    await run(
      tx,
      'INSERT INTO academic_notice VALUES (?,?,?,?,?,?,?)',
      prefix + 'school-notice',
      school.id,
      null,
      'Fictional school circular',
      'Sample circular: parent-teacher interaction is planned for next week. This is fictional data.',
      principal.id,
      at,
    );
    await event(prefix + 'school-notice', 'notice', principal.id);
    await run(
      tx,
      'INSERT INTO academic_notice_read VALUES (?,?,?)',
      prefix + 'school-notice',
      staff.id,
      at,
    );
    for (const [kind, person, status] of [
      ['leave', parent, 'submitted'],
      ['leave', teacher, 'approved'],
      ['service', staff, 'submitted'],
    ] as const) {
      const id = prefix + 'request-' + person.role,
        studentId = person.role === 'parent' ? prefix + 'student-0-1' : null;
      await run(
        tx,
        'INSERT INTO portal_request VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        id,
        person.id,
        school.id,
        studentId,
        kind,
        due,
        'Fictional ' +
          (kind === 'leave'
            ? 'leave application'
            : 'classroom maintenance request'),
        status,
        at,
        id,
        JSON.stringify({ sample: true }),
      );
      await run(
        tx,
        'INSERT INTO portal_request_event VALUES (?,?,?,?,?,?)',
        id + '-submitted',
        id,
        person.id,
        'submitted',
        'Fictional sample request',
        at,
      );
      if (status === 'approved')
        await run(
          tx,
          'INSERT INTO portal_request_event VALUES (?,?,?,?,?,?)',
          id + '-approved',
          id,
          principal.id,
          'approved',
          'Fictional approval for walkthrough',
          at,
        );
    }
    await run(
      tx,
      'INSERT INTO sample_data_run VALUES (?,?,?)',
      prefix,
      date,
      actor.id,
    );
    return { loadedOn: date, alreadyLoaded: false };
  });
}
