import { ErpWorkspace } from '@/components/erp/workspace';
import '../erp/erp.css';

export const dynamic = 'force-dynamic';

export default function StaffAppPage() {
  return <ErpWorkspace entryPath="/staff-app" initial={{}} />;
}
