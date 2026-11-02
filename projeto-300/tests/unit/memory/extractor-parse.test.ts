import { describe, expect, it } from 'vitest';
import { normalizeCandidate, parseJsonArray } from '@core/memory/extractor';
import { hasRememberCue, isValidCnpj, isValidCpf, looksSensitive, passesLuhn } from '@core/memory/sensitive';

describe('leitura do JSON do modelo', () => {
  it('array puro', () => {
    expect(parseJsonArray('[{"kind":"fact","content":"abc"}]')).toEqual([{ kind: 'fact', content: 'abc' }]);
  });
  it('com cerca de código e texto em volta', () => {
    const t = 'Claro! Aqui está:\n```json\n[\n {"kind": "preference", "content": "O dono gosta de [jazz] e {blues}"}\n]\n```\nEspero ter ajudado.';
    expect(parseJsonArray(t)).toEqual([{ kind: 'preference', content: 'O dono gosta de [jazz] e {blues}' }]);
  });
  it('texto antes e depois sem cerca, com vírgula sobrando', () => {
    expect(parseJsonArray('Resultado: [{"kind":"fact","content":"x y z",},] fim')).toEqual([{ kind: 'fact', content: 'x y z' }]);
  });
  it('objeto com lista dentro', () => {
    expect(parseJsonArray('{"memorias":[{"kind":"fact","content":"a"}]}')).toEqual([{ kind: 'fact', content: 'a' }]);
  });
  it('vazio e inválido', () => {
    expect(parseJsonArray('[]')).toEqual([]);
    expect(parseJsonArray('nada aqui')).toBeNull();
    expect(parseJsonArray('[{"kind": "fact", "content": ')).toBeNull();
    expect(parseJsonArray('')).toBeNull();
  });
  it('aspas escapadas e colchetes dentro de strings', () => {
    expect(parseJsonArray('lixo ] [ {"kind":"fact","content":"diz \\"oi]\\" sempre"} ]')).toEqual([{ kind: 'fact', content: 'diz "oi]" sempre' }]);
  });
});

describe('normalização dos candidatos', () => {
  it('aceita sinônimos em português e limita importância', () => {
    expect(normalizeCandidate({ kind: 'Preferência', content: 'O dono prefere chá verde.', importance: 7, sensitive: 'true', explicit: 1 })).toEqual({
      kind: 'preference',
      content: 'O dono prefere chá verde.',
      importance: 1,
      sensitive: true,
      explicit: true,
    });
  });
  it('rejeita lixo', () => {
    expect(normalizeCandidate({ kind: 'nada', content: 'O dono prefere chá.' })).toBeNull();
    expect(normalizeCandidate({ kind: 'fact', content: 'curto' })).toBeNull();
    expect(normalizeCandidate({ kind: 'fact', content: 42 })).toBeNull();
    expect(normalizeCandidate('texto')).toBeNull();
    expect(normalizeCandidate(null)).toBeNull();
  });
});

describe('detecção de conteúdo sensível', () => {
  it('documentos válidos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(passesLuhn('4111 1111 1111 1111')).toBe(true);
    expect(looksSensitive('Meu número é 529.982.247-25')).toBe(true);
    expect(looksSensitive('Cartão 4111-1111-1111-1111')).toBe(true);
  });
  it('palavras-chave (com ou sem acento)', () => {
    expect(looksSensitive('A senha do banco é xyz')).toBe(true);
    expect(looksSensitive('O dono toma remédio para pressão')).toBe(true);
    expect(looksSensitive('Diagnostico de diabetes')).toBe(true);
    expect(looksSensitive('salário de 5 mil')).toBe(true);
    expect(looksSensitive('chave sk-abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });
  it('palavras ambíguas não marcam fatos comuns como sensíveis (o extrator descartaria)', () => {
    expect(looksSensitive('O dono trabalha numa agência de publicidade.')).toBe(false);
    expect(looksSensitive('O projeto Atlas precisa de uma nova identidade visual.')).toBe(false);
    expect(looksSensitive('O dono cuida do tratamento de dados da empresa.')).toBe(false);
    // ...mas os casos sensíveis continuam detectados
    expect(looksSensitive('Agência 1234, conta 56789-0')).toBe(true);
    expect(looksSensitive('A agência do banco do dono é a do centro.')).toBe(true);
    expect(looksSensitive('O número da identidade dele está na gaveta.')).toBe(true);
    expect(looksSensitive('O dono está em tratamento médico.')).toBe(true);
    expect(looksSensitive('O dono está fazendo tratamento para a coluna.')).toBe(true);
  });

  it('conteúdo comum não é sensível', () => {
    expect(looksSensitive('O dono prefere café sem açúcar.')).toBe(false);
    expect(looksSensitive('Reunião às 14h com a equipe de vendas')).toBe(false);
    expect(looksSensitive('Telefone da pizzaria: 3333-4444')).toBe(false);
  });
  it('pedido explícito para lembrar', () => {
    expect(hasRememberCue('Lembre que meu CPF é tal')).toBe(true);
    expect(hasRememberCue('anota aí: consulta dia 5')).toBe(true);
    expect(hasRememberCue('Não esqueça disso')).toBe(true);
    expect(hasRememberCue('Qual a previsão do tempo?')).toBe(false);
  });

  it('pedido explícito: formas comuns de pedir', () => {
    for (const t of [
      'Lembre-se: minha senha é X',
      'lembra que eu sou vegetariano',
      'guarda isso: meu cpf',
      'pode anotar que eu tomo remédio',
      'quero que você memorize meu RG',
      'coloca na memória que eu sou alérgico',
      'Não se esqueça: eu tomo remédio',
      'Salva isso',
      'Grave isso: placa ABC',
      'remember that my blood type is O+',
    ]) {
      expect(hasRememberCue(t), t).toBe(true);
    }
  });

  it('pedido explícito: palavras parecidas não contam (antes casavam pelo prefixo)', () => {
    for (const t of [
      'Crie um lembrete para amanhã',
      'Eu salvei o arquivo',
      'Leva o guarda-chuva',
      'não consigo lembrar do remédio',
      'Eu não esqueci do remédio',
      'Ficou registrado no sistema',
      'Li a anotação da reunião',
      'Você lembra qual é a minha senha?',
      'Você se lembra do meu aniversário?',
      'pode me lembrar amanhã de ligar',
      'Fui ao médico e falamos da diabetes.',
    ]) {
      expect(hasRememberCue(t), t).toBe(false);
    }
  });
});
