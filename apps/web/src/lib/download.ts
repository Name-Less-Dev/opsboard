/**
 * Faz o navegador baixar um Blob com o nome dado: link temporário com `download`, clique
 * programático e remoção. A URL do Blob é liberada logo em seguida (fora do clique, para o
 * navegador já ter começado o download), senão a memória do arquivo ficaria presa até fechar a aba.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
