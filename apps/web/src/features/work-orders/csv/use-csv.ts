import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiDownload, apiUpload } from '../../../lib/api';
import { saveBlob } from '../../../lib/download';
import type { ListParams } from '../list-params';
import { invalidateCollections } from '../use-work-order';
import {
  buildExportQuery,
  buildTemplateCsv,
  filenameFromContentDisposition,
  TEMPLATE_FILENAME,
} from './csv-files';
import type { ImportDone, ImportReport } from './csv-types';

/** Baixa o CSV com os filtros atuais (sem paginação). `isPending` cobre o download inteiro. */
export function useExportWorkOrders() {
  return useMutation({
    mutationFn: async (params: ListParams) => {
      const { blob, contentDisposition } = await apiDownload(
        `/work-orders/export?${buildExportQuery(params).toString()}`,
      );
      const filename = filenameFromContentDisposition(contentDisposition);
      saveBlob(blob, filename);
      return filename;
    },
  });
}

function importForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/** Etapa 1: só valida (`dryRun=true`). Nada é gravado, então não invalida nada. */
export function useValidateImport() {
  return useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportReport>('/work-orders/import?dryRun=true', importForm(file)),
  });
}

/** Etapa 2: grava de verdade. Ordens novas mudam a lista e o painel. */
export function useImportWorkOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      apiUpload<ImportDone>('/work-orders/import?dryRun=false', importForm(file)),
    onSuccess: () => invalidateCollections(queryClient),
  });
}

/** Modelo em branco, gerado no navegador (sem chamada à API). */
export function downloadTemplate(now: Date = new Date()): void {
  saveBlob(
    new Blob([buildTemplateCsv(now)], { type: 'text/csv;charset=utf-8' }),
    TEMPLATE_FILENAME,
  );
}
