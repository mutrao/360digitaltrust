/**
 * Calcul d'empreinte dans le navigateur.
 *
 * C'est la pièce qui rend le produit « privacy-first » : le fichier est lu
 * localement, seule son empreinte (32 à 64 octets) est transmise au serveur.
 * Aucun octet du document ne quitte le poste.
 */
import type { HashAlgorithm } from '@/types/api';

const WEBCRYPTO_NAME: Record<HashAlgorithm, string> = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

export interface FileDigest {
  hashB64: string;
  hashHex: string;
  algorithm: HashAlgorithm;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `crypto.subtle` exige un contexte sécurisé : HTTPS ou localhost. */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

export async function digestFile(
  file: File,
  algorithm: HashAlgorithm = 'sha256',
): Promise<FileDigest> {
  if (!isCryptoAvailable()) {
    throw new Error(
      "Le calcul d'empreinte nécessite une connexion sécurisée (HTTPS). " +
        "Contactez votre administrateur pour activer le certificat TLS.",
    );
  }

  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest(WEBCRYPTO_NAME[algorithm], buffer);
  const bytes = new Uint8Array(digest);

  return {
    hashB64: toBase64(bytes),
    hashHex: toHex(bytes),
    algorithm,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  };
}

/** Empreinte tronquée pour l'affichage : `a3f8c2e1…9f2e0c1a`. */
export function shortHash(hex: string, edge = 8): string {
  if (hex.length <= edge * 2) return hex;
  return `${hex.slice(0, edge)}…${hex.slice(-edge)}`;
}

/** Identifiant tronqué pour l'affichage : `8e3f-a12c…`. */
export function shortId(id: string, len = 8): string {
  return id.length <= len ? id : `${id.slice(0, len)}…`;
}
