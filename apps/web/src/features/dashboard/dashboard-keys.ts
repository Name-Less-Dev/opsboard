// Único lugar com a chave de cache do painel: o hook do painel lê daqui e as mutações de
// ordem invalidam daqui, sem strings soltas espalhadas.
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
};
