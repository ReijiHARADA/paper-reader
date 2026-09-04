export type PdfOpenErrorCode =
  | "password_protected"
  | "invalid_pdf"
  | "unknown";

export class PdfOpenError extends Error {
  readonly code: PdfOpenErrorCode;

  constructor(message: string, code: PdfOpenErrorCode) {
    super(message);
    this.name = "PdfOpenError";
    this.code = code;
  }
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name: unknown }).name);
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function classifyPdfOpenError(error: unknown): PdfOpenError {
  if (error instanceof PdfOpenError) return error;
  const name = errorName(error);
  const message = errorMessage(error);
  const blob = `${name} ${message}`;
  if (
    name === "PasswordException" ||
    /password/i.test(blob) ||
    /NeedPassword/i.test(blob)
  ) {
    return new PdfOpenError(
      "このPDFはパスワードで保護されています。パスワード付きのPDFは処理できません。",
      "password_protected"
    );
  }
  if (name === "InvalidPDFException" || /invalid pdf/i.test(blob)) {
    return new PdfOpenError(
      "PDFを開けませんでした。ファイルが壊れているか、PDFではない可能性があります。",
      "invalid_pdf"
    );
  }
  return new PdfOpenError(
    message || "PDFの読み込みに失敗しました。",
    "unknown"
  );
}
