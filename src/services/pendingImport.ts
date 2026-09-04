let pendingFile: File | null = null;

export function setPendingImportFile(file: File) {
  pendingFile = file;
}

export function takePendingImportFile(): File | null {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
