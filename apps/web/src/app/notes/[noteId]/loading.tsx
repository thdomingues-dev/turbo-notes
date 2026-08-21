import { PageLoadingState } from "@/shared/ui/AsyncState";

const NoteEditorLoading = () => {
  return <PageLoadingState label="Opening note" />;
};

export default NoteEditorLoading;
