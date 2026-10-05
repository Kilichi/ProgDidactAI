import { ProgramEditor } from '@/components/editor/program-editor';
export default async function ProgramPage({ params }) {
    const { id } = await params;
    return <ProgramEditor programId={id} />;
}
