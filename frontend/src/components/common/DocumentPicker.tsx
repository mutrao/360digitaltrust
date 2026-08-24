/**
 * Sélection d'un document et calcul local de son empreinte.
 *
 * Le fichier reste dans le navigateur : il n'est ni envoyé, ni conservé.
 * C'est la garantie « privacy-first » du produit, et elle est dite à
 * l'utilisateur au moment où elle compte.
 */
import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import { FileCheck2, Loader2, ShieldCheck, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { MonoValue } from '@/components/ui/Data';
import { cn, formatBytes } from '@/lib/utils';
import { digestFile, shortHash, type FileDigest } from '@/lib/crypto';
import type { HashAlgorithm } from '@/types/api';

const MAX_BYTES = 50 * 1024 * 1024;

const ACCEPTED: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/xml': 'XML',
  'text/xml': 'XML',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
};

const ACCEPT_ATTR = '.pdf,.xml,.docx,application/pdf,application/xml,text/xml';

function validate(file: File): string | null {
  if (file.size === 0) return 'Ce fichier est vide.';
  if (file.size > MAX_BYTES) {
    return `Ce fichier dépasse la taille maximale de ${formatBytes(MAX_BYTES)}.`;
  }
  const byExtension = /\.(pdf|xml|docx)$/i.test(file.name);
  if (!byExtension && !ACCEPTED[file.type]) {
    return 'Format non pris en charge. Utilisez un fichier PDF, XML ou DOCX.';
  }
  return null;
}

interface DocumentPickerProps {
  digest: FileDigest | null;
  onDigest: (digest: FileDigest | null) => void;
  algorithm?: HashAlgorithm;
  disabled?: boolean;
}

export function DocumentPicker({
  digest,
  onDigest,
  algorithm = 'sha256',
  disabled,
}: DocumentPickerProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);

      const invalid = validate(file);
      if (invalid) {
        setError(invalid);
        onDigest(null);
        return;
      }

      setComputing(true);
      try {
        onDigest(await digestFile(file, algorithm));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Le calcul de l'empreinte a échoué.");
        onDigest(null);
      } finally {
        setComputing(false);
      }
    },
    [algorithm, onDigest],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) void accept(e.dataTransfer.files[0]);
  };

  const clear = (): void => {
    onDigest(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Document retenu ────────────────────────────────────────────
  if (digest) {
    return (
      <div className="rounded-lg border border-success/30 bg-success-soft/40 p-4">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-ink">{digest.fileName}</p>
            <p className="mt-0.5 text-sm text-slate">
              {formatBytes(digest.fileSize)} · empreinte {digest.algorithm.toUpperCase()}{' '}
              calculée localement
            </p>
            <div className="mt-2">
              <MonoValue
                value={digest.hashHex}
                display={shortHash(digest.hashHex, 10)}
                label="l'empreinte"
              />
            </div>
          </div>
          {!disabled ? (
            <Button variant="ghost" size="icon" onClick={clear} aria-label="Retirer le document">
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Zone de dépôt ──────────────────────────────────────────────
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-lg border border-dashed p-8 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
          disabled && 'opacity-50',
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          disabled={disabled || computing}
          onChange={(e) => void accept(e.target.files?.[0])}
        />

        {computing ? (
          <>
            <Loader2 className="mx-auto size-6 animate-spin text-accent" aria-hidden />
            <p className="mt-3 text-base text-ink" role="status">
              Calcul de l'empreinte…
            </p>
          </>
        ) : (
          <>
            <Upload className="mx-auto size-6 text-muted" aria-hidden />
            <p className="mt-3 text-base text-ink">
              Glissez un document ici, ou{' '}
              <label
                htmlFor={inputId}
                className="cursor-pointer font-medium text-accent underline-offset-4 hover:underline"
              >
                parcourez vos fichiers
              </label>
            </p>
            <p className="mt-1 text-sm text-muted">
              PDF, XML ou DOCX · {formatBytes(MAX_BYTES)} maximum
            </p>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Le document reste sur votre poste. Seule son empreinte est transmise.
        </p>
      )}
    </div>
  );
}
