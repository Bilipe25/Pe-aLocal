// =============================================================================
// Storage Provider — PedidoLocal
// =============================================================================
// Interface para upload de imagens.
// Compatível com: Vercel Blob, Supabase Storage, S3, R2, local.
// =============================================================================

export interface UploadInput {
  /** Bytes do arquivo, compatíveis com Web APIs e Workers. */
  buffer: Uint8Array;
  /** Nome original do arquivo */
  filename: string;
  /** MIME type (ex: "image/jpeg") */
  contentType: string;
  /** Diretório/prefixo no storage (ex: "stores/abc123/products") */
  folder: string;
}

export interface UploadedFile {
  /** URL pública da imagem */
  url: string;
  /** Chave única no storage (usada para deletar) */
  key: string;
  /** Tamanho em bytes */
  size: number;
}

export interface StorageProvider {
  /** Faz upload de um arquivo e retorna a URL pública */
  upload(input: UploadInput): Promise<UploadedFile>;
  /** Remove um arquivo do storage pela chave */
  delete(fileKey: string): Promise<void>;
}

// =============================================================================
// Validação de Upload
// =============================================================================

/** Tipos MIME permitidos para imagens */
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Tamanho máximo de upload: 5MB */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida um arquivo antes do upload.
 */
export function validateFile(
  file: { size: number; type: string },
  options?: { maxSize?: number; allowedTypes?: Set<string> },
): FileValidationResult {
  const maxSize = options?.maxSize ?? MAX_FILE_SIZE;
  const allowedTypes = options?.allowedTypes ?? ALLOWED_IMAGE_TYPES;

  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return {
      valid: false,
      error: `O arquivo excede o tamanho máximo de ${maxMB}MB.`,
    };
  }

  if (!allowedTypes.has(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido. Use: ${[...allowedTypes].join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Gera um nome seguro para o arquivo.
 * Remove caracteres especiais e adiciona timestamp para unicidade.
 */
export function generateSafeFilename(originalName: string): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const extension = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
  const baseName = originalName
    .replace(/\.[^/.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40)
    .toLowerCase();

  return `${baseName}-${timestamp}-${random}.${extension}`;
}
