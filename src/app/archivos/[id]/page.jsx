import { FileEditor } from '@/components/editor/file-editor';
export default async function FilePage({ params }) {
    const { id } = await params;
    return <FileEditor fileId={id} />;
}
