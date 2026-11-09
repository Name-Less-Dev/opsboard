import type { Locator, Page } from '@playwright/test';

// Elementos visuais do vídeo, injetados em cada página por `addInitScript`: um cursor que segue o
// mouse (com um anel no clique), a legenda do rodapé e o cartão de título. Ficam acima de tudo e
// não recebem cliques (`pointer-events: none`), então não atrapalham a interação real.

const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #demo-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 50%; background: rgba(37, 99, 235, .15); border: 2px solid #1d4ed8;
        box-shadow: 0 0 0 2px #fff; pointer-events: none; transition: transform .12s ease; left: -50px; top: -50px; }
      #demo-cursor.down { transform: scale(.75); }
      .demo-ring { position: fixed; z-index: 2147483646; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 50%; border: 2px solid #1d4ed8; pointer-events: none; animation: demo-ring .45s ease-out forwards; }
      @keyframes demo-ring { to { transform: scale(2.6); opacity: 0; } }
      #demo-caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 22px; transform: translateX(-50%);
        max-width: 86%; padding: 10px 18px; border-radius: 10px; background: rgba(17, 24, 39, .92); color: #fff;
        font: 500 19px/1.35 system-ui, "Segoe UI", sans-serif; text-align: center; pointer-events: none;
        box-shadow: 0 6px 20px rgba(0,0,0,.25); opacity: 0; transition: opacity .25s ease; }
      #demo-caption.on { opacity: 1; }
      #demo-card { position: fixed; inset: 0; z-index: 2147483644; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 14px; background: #0f172a; color: #fff;
        font-family: system-ui, "Segoe UI", sans-serif; text-align: center; pointer-events: none; }
      #demo-card h1 { margin: 0; font-size: 64px; font-weight: 700; letter-spacing: -.02em; }
      #demo-card p { margin: 0; max-width: 820px; font-size: 24px; line-height: 1.4; color: #cbd5e1; }
    `;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    document.body.append(cursor, caption);

    // A última posição sobrevive à troca de página (sessionStorage), para o cursor não sumir.
    const saved = sessionStorage.getItem('demo-cursor');
    if (saved) {
      const [x, y] = saved.split(',');
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
    }
    window.addEventListener(
      'mousemove',
      (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
        sessionStorage.setItem('demo-cursor', `${event.clientX},${event.clientY}`);
      },
      true,
    );
    window.addEventListener(
      'mousedown',
      (event) => {
        cursor.classList.add('down');
        const ring = document.createElement('div');
        ring.className = 'demo-ring';
        ring.style.left = `${event.clientX}px`;
        ring.style.top = `${event.clientY}px`;
        document.body.append(ring);
        setTimeout(() => ring.remove(), 500);
      },
      true,
    );
    window.addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  };
  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install);
};

export async function installOverlay(page: Page) {
  await page.addInitScript(OVERLAY);
}

/** Pausa de leitura. Só no vídeo: nos testes, esperas fixas são proibidas. */
export function pause(page: Page, ms: number) {
  return page.waitForTimeout(ms);
}

/** Troca a legenda do rodapé (texto vazio esconde). */
export async function caption(page: Page, text: string) {
  await page.evaluate((value) => {
    const element = document.getElementById('demo-caption');
    if (!element) return;
    element.textContent = value;
    element.classList.toggle('on', value !== '');
  }, text);
}

/** Cartão de tela cheia (título ou encerramento), por cima da página. */
export async function card(page: Page, title: string, subtitle: string) {
  await page.evaluate(
    ([heading, text]) => {
      document.getElementById('demo-card')?.remove();
      const element = document.createElement('div');
      element.id = 'demo-card';
      const h1 = document.createElement('h1');
      h1.textContent = heading;
      const p = document.createElement('p');
      p.textContent = text;
      element.append(h1, p);
      document.body.append(element);
    },
    [title, subtitle] as const,
  );
}

export async function hideCard(page: Page) {
  await page.evaluate(() => document.getElementById('demo-card')?.remove());
}

/** Leva o cursor até o elemento em movimento suave (vários passos). */
export async function moveTo(page: Page, target: Locator) {
  // Centraliza o alvo: longe da legenda do rodapé, que cobriria o que está rente à borda.
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = await target.boundingBox();
  if (!box) throw new Error('Elemento sem posição na tela');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
}

/** Move até o elemento, espera um instante (para quem assiste ver) e clica. */
export async function clickOn(page: Page, target: Locator) {
  await moveTo(page, target);
  await pause(page, 250);
  await target.click();
}

/** Clica no campo e digita em ritmo humano. */
export async function typeInto(page: Page, target: Locator, text: string) {
  await clickOn(page, target);
  await target.pressSequentially(text, { delay: 65 });
}

/** Pausa de leitura proporcional ao texto: 2 s a 3 s. */
export function readingPause(page: Page, text: string) {
  return pause(page, Math.min(3000, Math.max(2000, text.length * 55)));
}

/** Instante para quem assiste "olhar" uma tela que acabou de aparecer. */
export function look(page: Page) {
  return pause(page, 900);
}
