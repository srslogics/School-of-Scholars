import { ErpEntryPage } from '@/components/erp/entry-page';
import '../erp/erp.css';

export const dynamic = 'force-dynamic';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{
    class?: string | string[];
    date?: string | string[];
  }>;
}) {
  return <ErpEntryPage searchParams={searchParams} entryPath="/office-app" />;
}
