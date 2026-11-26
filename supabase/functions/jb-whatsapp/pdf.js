// =====================================================================
// JB WhatsApp · PDF do resumo do dia, no modelo dos documentos do programa
// ("Ficha do funcionário": faixa preta com a logo, painel vermelho, título
// abaixo, seções com quadrado vermelho, filetes tracejados e rodapé fino).
// Recebe o pdf-lib como argumento para rodar igual na função e nos testes.
// =====================================================================

const COR = { TC: [211, 18, 28], TX: [20, 20, 22], CZ: [91, 91, 99], FI: [227, 227, 232], BG: [245, 245, 247], PT: [17, 17, 20], BR: [255, 255, 255], CL: [189, 189, 198] };
const W = 595.28, H = 841.89, M = 44;

/* As fontes padrão do PDF só têm os caracteres de Windows-1252 */
const limpar = (t) => String(t ?? '').replace(/[\r\n\t\u00a0\u202f]+/g, ' ').replace(/[^\x20-\x7e\xa1-\xff–—‘’“”•…€]/g, '').trim();

export function nomeArquivo(dia) { return 'Resumo-do-dia-' + dia + '.pdf'; }

export async function gerarPdf(PDFLib, R, logoBytes, opc = {}) {
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = PDFLib;
  const c = (k) => rgb(COR[k][0] / 255, COR[k][1] / 255, COR[k][2] / 255);
  const doc = await PDFDocument.create();
  doc.setTitle('Resumo do dia ' + R.dia); doc.setAuthor('JB Gestão de Cerâmica'); doc.setCreator('JB Gestão'); doc.setProducer('JB Gestão');
  const rg = await doc.embedFont(StandardFonts.Helvetica), bd = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  let pg = doc.addPage([W, H]), y = 0;
  /* o "³" não aparece em todo leitor de PDF com a fonte padrão: sai como um 3 pequeno e elevado */
  const medir = (str, f, s) => str.split('³').reduce((a, p, i) => a + f.widthOfTextAtSize(p, s) + (i ? f.widthOfTextAtSize('3', s * 0.62) : 0), 0);
  const tx = (t, x, yy, o = {}) => {
    const f = o.b ? bd : rg, s = o.s || 8.5, str = limpar(t), cor = c(o.c || 'TX');
    let xx = o.dir ? x - medir(str, f, s) : x;
    str.split('³').forEach((p, i) => {
      if (i) { pg.drawText('3', { x: xx, y: H - yy + s * 0.34, size: s * 0.62, font: f, color: cor }); xx += f.widthOfTextAtSize('3', s * 0.62); }
      if (p) { pg.drawText(p, { x: xx, y: H - yy, size: s, font: f, color: cor }); xx += f.widthOfTextAtSize(p, s); }
    });
  };
  const larg = (t, o = {}) => medir(limpar(t), o.b ? bd : rg, o.s || 8.5);
  const quebra = (t, max, o = {}) => {
    const out = []; let at = '';
    for (const p of limpar(t).split(' ')) {
      const nv = at ? at + ' ' + p : p;
      if (larg(nv, o) <= max || !at) at = nv; else { out.push(at); at = p; }
    }
    if (at) out.push(at);
    return out;
  };
  const novaPagina = () => { pg = doc.addPage([W, H]); y = 40; };
  const reserva = (a) => { if (y + a > H - 46) novaPagina(); };

  /* faixa preta, painel vermelho com a data */
  const hF = 66, tL = 48, wP = Math.round(W * 0.31), incl = 36, xP = W - wP;
  pg.drawRectangle({ x: 0, y: H - hF, width: W, height: hF, color: c('PT') });
  pg.drawRectangle({ x: xP + incl - 1, y: H - hF, width: wP - incl + 1, height: hF, color: c('TC') });
  pg.drawSvgPath(`M ${xP + incl} 0 L ${xP + incl} ${hF} L ${xP} ${hF} Z`, { x: 0, y: H, color: c('TC'), borderWidth: 0 });
  pg.drawRectangle({ x: 0, y: H - hF - 3, width: W, height: 3, color: c('TC') });
  if (logo) pg.drawImage(logo, { x: M, y: H - (hF + tL) / 2, width: tL, height: tL });
  const xE = M + (logo ? tL + 11 : 0);
  tx(R.empresa.razao.toUpperCase(), xE, 27, { b: 1, s: 10.8, c: 'BR' });
  tx('CNPJ ' + R.empresa.cnpj, xE, 39, { s: 7.2, c: 'CL' });
  tx('JB Gestão de Cerâmica · Jeferson Dias de Azevedo', xE, 49, { s: 7.2, c: 'CL' });
  tx('DIA DO RESUMO', W - M, 27, { s: 6.8, c: 'BR', dir: 1 });
  tx(R.dia.slice(8, 10) + '/' + R.dia.slice(5, 7) + '/' + R.dia.slice(0, 4), W - M, 45, { b: 1, s: 15, c: 'BR', dir: 1 });

  y = hF + 3 + 27;
  tx('RESUMO DO DIA', M, y, { b: 1, s: 14 });
  y += 13;
  tx(R.dia_longo.toUpperCase() + ' · LANÇAMENTOS FEITOS NO SISTEMA ATÉ AS 19H', M, y, { s: 7.4, c: 'CZ' });
  y += 18;

  /* cartões dos números principais */
  const T = R.totais;
  const fm = (v) => (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cartoes = [['ENTROU', fm(T.entrou)], ['SAIU', fm(T.saiu)], ['SALDO DO DIA', fm(T.saldo)], ['VENDIDO', fm(T.vendido)]];
  const gap = 7, wC = (W - 2 * M - gap * 3) / 4, hC = 40;
  cartoes.forEach(([l, v], i) => {
    const x = M + i * (wC + gap);
    pg.drawRectangle({ x, y: H - y - hC, width: wC, height: hC, color: c('BG') });
    tx(l, x + 8, y + 14, { s: 6.6, c: 'CZ' });
    let s = 11.5; while (larg(v, { b: 1, s }) > wC - 14 && s > 7) s -= 0.5;
    tx(v, x + 8, y + 30, { b: 1, s, c: i === 2 && T.saldo < 0 ? 'TC' : 'TX' });
  });
  y += hC + 18;

  const trac = (yy) => pg.drawLine({ start: { x: M, y: H - yy }, end: { x: W - M, y: H - yy }, thickness: 0.5, color: c('FI'), dashArray: [2, 2], lineCap: LineCapStyle?.Butt });

  R.secoes.forEach((S, i) => {
    reserva(46);
    pg.drawRectangle({ x: M, y: H - y, width: 6.2, height: 6.2, color: c('TC') });
    tx(String(i + 1), M + 12, y, { b: 1, s: 9, c: 'CZ' });
    tx(S.titulo.toUpperCase(), M + 12 + larg(String(i + 1), { b: 1, s: 9 }) + 6, y, { b: 1, s: 9 });
    y += 13;
    if (S.aviso) { reserva(14); tx(S.aviso, M, y, { s: 7.6, c: 'TC' }); y += 12; }
    if (!S.linhas.length) { reserva(14); tx(S.vazio || 'Nada lançado neste dia.', M, y + 2, { s: 8, c: 'CZ' }); y += 20; return; }
    S.linhas.forEach((L) => {
      const wV = L.v ? larg(L.v, { b: 1, s: 8.6 }) + 14 : 0, max = W - 2 * M - wV;
      const ts = quebra(L.t, max, { b: 1, s: 8.6 }), ss = L.s ? quebra(L.s, max, { s: 7.2 }) : [];
      const alt = 7 + ts.length * 11 + ss.length * 9 + 3;
      reserva(alt);
      let yy = y + 9;
      ts.forEach((l, k) => { tx(l, M, yy, { b: 1, s: 8.6 }); if (k === 0 && L.v) tx(L.v, W - M, yy, { b: 1, s: 8.6, dir: 1 }); yy += 11; });
      ss.forEach((l) => { tx(l, M, yy - 1, { s: 7.2, c: 'CZ' }); yy += 9; });
      y += alt; trac(y - 1);
    });
    y += 15;
  });

  /* rodapé fino em todas as páginas */
  const pags = doc.getPages(), geradoEm = opc.geradoEm || '';
  pags.forEach((p, i) => {
    pg = p;
    p.drawLine({ start: { x: M, y: 32 }, end: { x: W - M, y: 32 }, thickness: 0.5, color: c('FI') });
    tx('JB Gestão de Cerâmica · Resumo do dia' + (geradoEm ? ' · ' + geradoEm : ''), M, H - 22, { s: 6.8, c: 'CZ' });
    tx('Página ' + (i + 1) + ' de ' + pags.length, W - M, H - 22, { s: 6.8, c: 'CZ', dir: 1 });
  });
  return await doc.save();
}
