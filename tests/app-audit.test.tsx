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

const { ErpWorkspace } = await import('../components/erp/workspace');
const { appNavigation } = await import('../lib/erp/navigation');
const { workspacePath } = await import('../lib/erp/model');
const { createHandler } = await import('../lib/erp/http');
const { initializeDatabase, openFileDatabase } =
  await import('../lib/erp/database');
const { bootstrapCampus } = await import('../lib/erp/campus');
const { mkdtempSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const pathModule = await import('node:path');
const join = (...parts: string[]) => pathModule.join(...parts);

void test('all six apps load every authorised sidebar module against the shared database', async () => {
  const original = globalThis.fetch;
  const directory = mkdtempSync(join(tmpdir(), 'school-app-audit-'));
  const db = openFileDatabase(join(directory, 'school.sqlite'));
  try {
    await initializeDatabase(db);
    await bootstrapCampus(db, () => 'sos2026', true);
    const handler = createHandler(db, 'http://localhost');
    const roles = [
      ['admin', 'administrator'],
      ['principal', 'principal'],
      ['office', 'officer'],
      ['teacher', 'teacher'],
      ['parent', 'parent'],
      ['staff', 'staff'],
    ] as const;
    for (const [username, role] of roles) {
      const login = await handler(
        new Request('http://localhost/api/erp/login', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ username, password: 'sos2026' }),
        }),
      );
      assert.equal(login.status, 200, username);
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      const failures: string[] = [];
      const calls: string[] = [];
      globalThis.fetch = async (input, options) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const response = await handler(
          new Request(new URL(url, 'http://localhost'), {
            method: options?.method ?? 'GET',
            headers: {
              cookie,
              origin: 'http://localhost',
              'content-type': 'application/json',
            },
            ...(options?.body ? { body: options.body } : {}),
          }),
        );
        calls.push(url);
        if (response.status >= 400) failures.push(url + ' ' + response.status);
        return response;
      };
      render(<ErpWorkspace entryPath={workspacePath(role)} initial={{}} />);
      await screen.findByRole('navigation', { name: 'App navigation' });
      await waitFor(() => assert.ok(calls.length >= 2));
      for (const group of appNavigation(role)) {
        const summary = screen.getByText(group.label, { selector: 'summary' });
        if (!summary.closest('details')!.open) fireEvent.click(summary);
        for (const item of group.items) {
          const menu = await screen.findByRole('button', {
            name: item.label,
          });
          fireEvent.click(menu);
          await waitFor(() =>
            assert.equal(
              screen.getByRole('heading', { level: 1 }).textContent,
              item.label,
            ),
          );
          await waitFor(() =>
            assert.equal(
              screen.queryByText(
                /Loading (school records|your records|school setup|fee records|student register|register|attendance summary)/,
              ),
              null,
            ),
          );
          assert.equal(
            screen.queryByRole('alert'),
            null,
            username + ' ' + item.id,
          );
        }
      }
      assert.deepEqual(failures, [], username);
      assert.ok(
        calls.some((path) => path.includes('academics')),
        username + ' academics',
      );
      cleanup();
    }
  } finally {
    cleanup();
    globalThis.fetch = original;
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
