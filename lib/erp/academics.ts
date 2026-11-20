import { randomUUID } from 'node:crypto';
import { many, one, run, write, type Query, type Database } from './database';
import { workspace } from './attendance';
import { type Account, type ClassSection, todayInNagpur } from './model';
import { requiredText, ErpError, missing } from './validation';

export type AcademicStudent = {
  id: string;
  name: string;
  roll: string;
  classId: string;
};
export type Exam = {
  id: string;
  classId: string;
  title: string;
  subject: string;
  examOn: string;
  maxScore: number;
  status: string;
};
async function context(db: Query, account: Account) {
  const schoolView = await workspace(db, account);
  let classes: ClassSection[] = [];
  let students: AcademicStudent[] = [];
  if (account.role === 'parent') {
    students = await many(
      db,
      'SELECT e.id,e.name,e.roll,e.class_id AS classId FROM enrolment e JOIN guardian_link g ON g.student_id=e.id WHERE g.account_id=?',
      account.id,
    );
    classes = await many(
      db,
      'SELECT DISTINCT c.id,c.school_id AS schoolId,c.grade,c.section FROM class_section c JOIN enrolment e ON e.class_id=c.id JOIN guardian_link g ON g.student_id=e.id WHERE g.account_id=?',
      account.id,
    );
  } else if (account.role === 'administrator') {
    classes = await many(
      db,
      'SELECT id,school_id AS schoolId,grade,section FROM class_section',
    );
  } else if (account.role === 'teacher' || account.role === 'principal')
    classes = schoolView.classes;
  if (
    account.role === 'administrator' ||
    account.role === 'teacher' ||
    account.role === 'principal'
  ) {
    for (const section of classes)
      students.push(
        ...(await many<AcademicStudent>(
          db,
          'SELECT id,name,roll,class_id AS classId FROM enrolment WHERE class_id=? AND effective_on <= ?',
          section.id,
          todayInNagpur(),
        )),
      );
  }
  return {
    classes,
    students,
    schools:
      account.role === 'parent'
        ? [
            ...new Set([
              ...classes.map((c) => c.schoolId),
              ...(
                await many<{ id: string }>(
                  db,
                  "SELECT id FROM school WHERE code='SOS-KATOL'",
                )
              ).map((s) => s.id),
            ]),
          ]
        : schoolView.schools.map((s) => s.id),
  };
}

export async function academics(db: Query, account: Account) {
  const scope = await context(db, account);
  const timetable: {
    id: string;
    classId: string;
    teacher: string;
    weekday: number;
    starts: string;
    ends: string;
    subject: string;
  }[] = [];
  const homework: {
    id: string;
    classId: string;
    subject: string;
    title: string;
    instructions: string;
    dueOn: string;
  }[] = [];
  const exams: Exam[] = [];
  const results: { examId: string; studentId: string; score: number | null }[] =
    [];
  const examRoster: { examId: string; studentId: string }[] = [];
  for (const section of scope.classes) {
    timetable.push(
      ...(await many<(typeof timetable)[number]>(
        db,
        'SELECT t.id,t.class_id AS classId,a.name AS teacher,t.weekday,t.starts,t.ends,t.subject FROM academic_slot t JOIN account a ON a.id=t.teacher_id WHERE t.class_id=? ORDER BY t.weekday,t.starts',
        section.id,
      )),
    );
    homework.push(
      ...(await many<(typeof homework)[number]>(
        db,
        'SELECT id,class_id AS classId,subject,title,instructions,due_on AS dueOn FROM academic_homework WHERE class_id=? ORDER BY due_on DESC,created_at DESC',
        section.id,
      )),
    );
    const papers = await many<Exam>(
      db,
      "SELECT id,class_id AS classId,title,subject,exam_on AS examOn,max_score AS maxScore,status FROM academic_exam WHERE class_id=? AND (? <> 'parent' OR status='published') ORDER BY exam_on DESC",
      section.id,
      account.role,
    );
    exams.push(...papers);
    for (const paper of papers) {
      const roster = await many<{ studentId: string; score: number | null }>(
        db,
        'SELECT e.student_id AS studentId,m.score FROM academic_exam_student e LEFT JOIN academic_mark m ON m.exam_id=e.exam_id AND m.student_id=e.student_id WHERE e.exam_id=?',
        paper.id,
      );
      for (const row of roster) {
        if (
          account.role === 'parent' &&
          !scope.students.some((s) => s.id === row.studentId)
        )
          continue;
        examRoster.push({ examId: paper.id, studentId: row.studentId });
        results.push({ examId: paper.id, ...row });
      }
    }
  }
  const teachers: { id: string; name: string; classId: string }[] = [];
  if (account.role === 'principal' || account.role === 'administrator')
    for (const section of scope.classes)
      teachers.push(
        ...(await many<(typeof teachers)[number]>(
          db,
          "SELECT a.id,a.name,c.class_id AS classId FROM account a JOIN class_assignment c ON c.account_id=a.id LEFT JOIN portal_profile p ON p.account_id=a.id WHERE c.class_id=? AND a.role='teacher' AND p.account_id IS NULL",
          section.id,
        )),
      );
  const candidates = await many<{
    id: string;
    schoolId: string;
    classId: string | null;
    title: string;
    message: string;
    author: string;
    createdAt: string;
    readAt: string | null;
  }>(
    db,
    'SELECT n.id,n.school_id AS schoolId,n.class_id AS classId,n.title,n.message,a.name AS author,n.created_at AS createdAt,r.read_at AS readAt FROM academic_notice n JOIN account a ON a.id=n.actor_id LEFT JOIN academic_notice_read r ON r.notice_id=n.id AND r.account_id=? ORDER BY n.created_at DESC',
    account.id,
  );
  const notices = candidates.filter(
    (n) =>
      scope.schools.includes(n.schoolId) &&
      (!n.classId || scope.classes.some((c) => c.id === n.classId)),
  );
  return {
    ...scope,
    teachers,
    timetable,
    homework,
    exams,
    results,
    examRoster,
    notices,
    canSchedule: ['administrator', 'principal'].includes(account.role),
    canTeach: ['teacher', 'principal', 'administrator'].includes(account.role),
    canPublish: ['principal', 'administrator'].includes(account.role),
  };
}

function day(value: unknown) {
  const text = requiredText(value, 'Date', 10),
    parsed = new Date(text + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(+parsed) ||
    parsed.toISOString().slice(0, 10) !== text
  )
    throw new ErpError(400, 'Choose a valid date.');
  return text;
}
export async function updateAcademics(
  db: Database,
  account: Account,
  body: Record<string, unknown>,
) {
  await write(db, async (tx) => {
    const scope = await academics(tx, account);
    const action = requiredText(body.action, 'Action', 24);
    const id = randomUUID(),
      at = new Date().toISOString();
    if (action === 'read-notice') {
      const noticeId = requiredText(body.noticeId, 'Notice', 64);
      if (!scope.notices.some((n) => n.id === noticeId)) missing();
      await run(
        tx,
        'INSERT INTO academic_notice_read VALUES (?,?,?) ON CONFLICT DO NOTHING',
        noticeId,
        account.id,
        at,
      );
      return;
    }

    if (!scope.canTeach) missing();
    if ((action === 'slot' || action === 'remove-slot') && !scope.canSchedule)
      missing();
    if (action === 'publish' && !scope.canPublish)
      throw new ErpError(403, 'Principal approval is required.');
    if (action === 'marks' || action === 'publish') {
      if (!scope.exams.some((e) => e.id === body.examId)) missing();
    } else if (
      body.classId &&
      !scope.classes.some((c) => c.id === body.classId)
    )
      missing();
    const requestKey = requiredText(body.requestId, 'Request ID', 80);
    const payload = JSON.stringify(
      Object.fromEntries(
        Object.entries(body)
          .filter(([key]) => key !== 'requestId')
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    const prior = await one<{ account_id: string; payload: string }>(
      tx,
      'SELECT account_id,payload FROM academic_operation WHERE request_key=?',
      requestKey,
    );
    if (prior) {
      if (prior.account_id !== account.id || prior.payload !== payload)
        throw new ErpError(
          409,
          'Request ID already used for another operation.',
        );
      return;
    }
    let recordId: string = id;
    if (action === 'marks' || action === 'publish') {
      const examId = requiredText(body.examId, 'Examination', 64),
        paper = scope.exams.find((e) => e.id === examId);
      if (!paper) missing();
      if (!scope.canTeach) missing();
      if (paper.status !== 'draft')
        throw new ErpError(409, 'Published marks are locked.');
      if (action === 'publish') {
        if (!scope.canPublish)
          throw new ErpError(403, 'Principal approval is required.');
        if (paper.examOn > todayInNagpur())
          throw new ErpError(409, 'Publish after the examination date.');
        const rows = scope.results.filter((r) => r.examId === examId);
        if (!rows.length || rows.some((r) => r.score === null))
          throw new ErpError(
            409,
            'Enter marks for every student in the saved exam roster.',
          );
        await run(
          tx,
          "UPDATE academic_exam SET status='published' WHERE id=?",
          examId,
        );
      } else {
        const studentId = requiredText(body.studentId, 'Student', 64);
        if (
          !scope.examRoster.some(
            (r) => r.examId === examId && r.studentId === studentId,
          )
        )
          missing();
        if (
          !Number.isInteger(body.score) ||
          (body.score as number) < 0 ||
          (body.score as number) > paper.maxScore
        )
          throw new ErpError(
            400,
            'Marks must be whole numbers between zero and the maximum.',
          );
        await run(
          tx,
          'INSERT INTO academic_mark VALUES (?,?,?,?,?) ON CONFLICT(exam_id,student_id) DO UPDATE SET score=excluded.score,actor_id=excluded.actor_id,updated_at=excluded.updated_at',
          examId,
          studentId,
          body.score as number,
          account.id,
          at,
        );
      }
      recordId = examId;
    } else {
      const classId = typeof body.classId === 'string' ? body.classId : '';
      const section = scope.classes.find((c) => c.id === classId);
      if (action === 'notice') {
        if (!scope.canTeach) missing();
        if (classId && !section) missing();
        if (!classId && !scope.canSchedule)
          throw new ErpError(
            403,
            'School-wide notices require principal or administrator access.',
          );
        const schoolId = section?.schoolId || scope.schools[0];
        if (!schoolId) missing();
        await run(
          tx,
          'INSERT INTO academic_notice VALUES (?,?,?,?,?,?,?)',
          id,
          schoolId,
          classId || null,
          requiredText(body.title, 'Title'),
          requiredText(body.message, 'Message', 4000),
          account.id,
          at,
        );
      } else {
        if (!section) missing();
        if (action === 'slot') {
          if (!scope.canSchedule) missing();
          const teacherId = requiredText(body.teacherId, 'Teacher', 64);
          if (
            !scope.teachers.some(
              (t) => t.id === teacherId && t.classId === classId,
            )
          )
            throw new ErpError(400, 'Assign this teacher to the class first.');
          const weekday = body.weekday as number,
            starts = requiredText(body.starts, 'Start time', 5),
            ends = requiredText(body.ends, 'End time', 5);
          if (
            !Number.isInteger(weekday) ||
            weekday < 1 ||
            weekday > 7 ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(starts) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(ends) ||
            starts >= ends
          )
            throw new ErpError(
              400,
              'Choose a valid weekday and time interval.',
            );
          if (
            await one(
              tx,
              'SELECT id FROM academic_slot WHERE weekday=? AND starts < ? AND ends > ? AND (class_id=? OR teacher_id=?)',
              weekday,
              ends,
              starts,
              classId,
              teacherId,
            )
          )
            throw new ErpError(
              409,
              'The class or teacher has an overlapping period.',
            );
          await run(
            tx,
            'INSERT INTO academic_slot VALUES (?,?,?,?,?,?,?)',
            id,
            classId,
            teacherId,
            weekday,
            starts,
            ends,
            requiredText(body.subject, 'Subject', 64),
          );
        } else if (action === 'remove-slot') {
          if (!scope.canSchedule) missing();
          const slot = scope.timetable.find(
            (t) => t.id === body.id && t.classId === classId,
          );
          if (!slot) missing();
          await run(tx, 'DELETE FROM academic_slot WHERE id=?', slot.id);
          recordId = slot.id;
        } else if (action === 'homework') {
          if (!scope.canTeach) missing();
          const due = day(body.dueOn);
          if (due < todayInNagpur())
            throw new ErpError(400, 'Homework due date cannot be in the past.');
          await run(
            tx,
            'INSERT INTO academic_homework VALUES (?,?,?,?,?,?,?,?)',
            id,
            classId,
            requiredText(body.subject, 'Subject', 64),
            requiredText(body.title, 'Title'),
            requiredText(body.instructions, 'Instructions', 4000),
            due,
            account.id,
            at,
          );
        } else if (action === 'exam') {
          if (!scope.canTeach) missing();
          const max = body.maxScore as number;
          if (!Number.isInteger(max) || max < 1 || max > 1000)
            throw new ErpError(
              400,
              'Maximum marks must be a whole number from 1 to 1000.',
            );
          const roster = scope.students.filter((s) => s.classId === classId);
          if (!roster.length)
            throw new ErpError(
              409,
              'Enrol students before creating an examination.',
            );
          const title = requiredText(body.title, 'Exam or term title'),
            subject = requiredText(body.subject, 'Subject', 64);
          if (
            await one(
              tx,
              'SELECT id FROM academic_exam WHERE class_id=? AND title=? AND subject=?',
              classId,
              title,
              subject,
            )
          )
            throw new ErpError(
              409,
              'This subject is already included in the exam.',
            );
          await run(
            tx,
            "INSERT INTO academic_exam VALUES (?,?,?,?,?,?,'draft',?)",
            id,
            classId,
            title,
            subject,
            day(body.examOn),
            max,
            account.id,
          );
          for (const student of roster)
            await run(
              tx,
              'INSERT INTO academic_exam_student VALUES (?,?)',
              id,
              student.id,
            );
        } else throw new ErpError(400, 'Unknown academic action.');
      }
    }
    await run(
      tx,
      'INSERT INTO academic_operation VALUES (?,?,?)',
      requestKey,
      account.id,
      payload,
    );
    const { action: _action, ...details } = body;
    await run(
      tx,
      'INSERT INTO academic_event VALUES (?,?,?,?,?,?)',
      randomUUID(),
      recordId,
      account.id,
      action,
      JSON.stringify(details),
      at,
    );
  });
  return academics(db, account);
}
