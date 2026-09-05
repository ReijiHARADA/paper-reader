let pendingFile: File | null = null;
let pendingWorkspaceNodeId: string | null = null;

export function setPendingImportFile(file: File, options?: { workspaceNodeId?: string }) {
  pendingFile = file;
  pendingWorkspaceNodeId = options?.workspaceNodeId ?? null;
}

export function takePendingImport(): {
  file: File;
  workspaceNodeId: string | null;
} | null {
  if (!pendingFile) {
    pendingWorkspaceNodeId = null;
    return null;
  }
  const file = pendingFile;
  const workspaceNodeId = pendingWorkspaceNodeId;
  pendingFile = null;
  pendingWorkspaceNodeId = null;
  return { file, workspaceNodeId };
}

export function takePendingImportFile(): File | null {
  return takePendingImport()?.file ?? null;
}
