let pendingFile: File | null = null;
let pendingProjectId: string | null = null;

export function setPendingImportFile(file: File, options?: { projectId?: string }) {
  pendingFile = file;
  pendingProjectId = options?.projectId ?? null;
}

export function takePendingImport(): {
  file: File;
  projectId: string | null;
} | null {
  if (!pendingFile) {
    pendingProjectId = null;
    return null;
  }
  const file = pendingFile;
  const projectId = pendingProjectId;
  pendingFile = null;
  pendingProjectId = null;
  return { file, projectId };
}

export function takePendingImportFile(): File | null {
  return takePendingImport()?.file ?? null;
}
