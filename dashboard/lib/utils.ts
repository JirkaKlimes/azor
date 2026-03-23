import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a human-readable document title from source path or ID
 */
export function getDocumentTitle(sourcePath?: string, documentId?: string): string {
  if (sourcePath) {
    const filename = sourcePath.split('/').pop() || sourcePath;
    return filename.replace(/\.(md|txt|pdf|html)$/, '');
  }
  if (documentId) {
    const id = documentId.split(':').pop() || documentId;
    return `Document ${id.slice(0, 6)}`;
  }
  return 'Unknown Document';
}
