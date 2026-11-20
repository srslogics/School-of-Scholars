import { ErpWorkspace } from '@/components/erp/workspace';
import type { WorkspacePath } from '@/lib/erp/model';

export async function ErpEntryPage({
  searchParams,
  entryPath,
}: {
  entryPath: WorkspacePath;
  searchParams: Promise<{
    class?: string | string[];
    date?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <ErpWorkspace
      entryPath={entryPath}
      initial={{
        classId:
          typeof query.class === 'string'
            ? query.class.slice(0, 64)
            : undefined,
        date:
          typeof query.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(query.date)
            ? query.date
            : undefined,
      }}
    />
  );
}
