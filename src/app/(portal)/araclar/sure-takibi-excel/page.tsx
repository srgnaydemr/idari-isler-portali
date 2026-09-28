import {requireUser} from '@/lib/auth';
import {ImportPanel} from '@/components/import-panel';
export default async function Page(){await requireUser();return <><h1 className="page-title">Araç Süre Takibi</h1><ImportPanel kind="compliance"/></>}
