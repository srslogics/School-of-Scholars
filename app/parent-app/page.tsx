import { ErpWorkspace } from '@/components/erp/workspace';
import '../erp/erp.css';

export const dynamic = 'force-dynamic';

export default function ParentAppPage() {
  return <ErpWorkspace entryPath="/parent-app" initial={{}} />;
}
