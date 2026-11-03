// Fonte do "agora". Quem precisa do instante atual injeta Clock em vez de chamar new Date(),
// e os testes trocam o provider por um relógio fixo, sem mock global de data.
// Classe abstrata (e não interface) porque o Nest precisa de um valor em runtime como token.
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
