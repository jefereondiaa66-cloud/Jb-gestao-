import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { isBlockedAddress, safeFetch, validatePublicUrl } from '@core/security/net';
import { SecurityError } from '@core/security/paths';

let server: http.Server;
let port: number;
let base: string;
const sockets = new Set<Socket>();
const hanging = new Set<http.ServerResponse>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/ok') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ola mundo');
    } else if (url === '/big') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.alloc(20000, 97));
    } else if (url === '/hang') {
      hanging.add(res); // nunca responde
    } else if (url === '/red') {
      res.writeHead(302, { location: '/ok' });
      res.end();
    } else if (url === '/red-bad-scheme') {
      res.writeHead(302, { location: 'gopher://169.254.169.254/' });
      res.end();
    } else if (url === '/red-303') {
      res.writeHead(303, { location: '/echo-method' });
      res.end();
    } else if (url === '/red-307') {
      res.writeHead(307, { location: '/echo-method' });
      res.end();
    } else if (url === '/echo-method') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(req.method ?? '');
    } else {
      res.writeHead(404);
      res.end('nao');
    }
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  for (const res of hanging) res.destroy();
  for (const s of sockets) s.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('isBlockedAddress', () => {
  it('bloqueia loopback, privados, link-local, CGNAT, 0/8 e multicast', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255']) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });
  it('bloqueia formas IPv6 e IPv4 mapeado', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:10.0.0.1']) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });
  it('libera IPs públicos', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });
  it('allowPrivate libera tudo', () => {
    expect(isBlockedAddress('127.0.0.1', true)).toBe(false);
  });
});

describe('validatePublicUrl', () => {
  it('recusa esquemas não-http e credenciais embutidas', () => {
    expect(() => validatePublicUrl('ftp://exemplo.com')).toThrow(SecurityError);
    expect(() => validatePublicUrl('file:///etc/passwd')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://user:pass@exemplo.com')).toThrow(SecurityError);
  });
  it('recusa IPs bloqueados e nomes locais (allowPrivate false)', () => {
    expect(() => validatePublicUrl('http://127.0.0.1/')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://169.254.169.254/latest/meta-data/')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://[::1]/')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://[::ffff:127.0.0.1]/')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://localhost/')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://servico.internal/')).toThrow(SecurityError);
  });
  it('aceita URL pública', () => {
    expect(validatePublicUrl('https://exemplo.com/caminho?a=1').hostname).toBe('exemplo.com');
  });
});

describe('safeFetch — caminho feliz (servidor local, allowPrivate)', () => {
  it('faz GET e devolve corpo, status e content-type', async () => {
    const r = await safeFetch(`${base}/ok`, { allowPrivate: true });
    expect(r.status).toBe(200);
    expect(r.body.toString('utf8')).toBe('ola mundo');
    expect(r.contentType).toContain('text/plain');
    expect(r.url).toBe(`${base}/ok`);
  });

  it('segue redirecionamento e revela a URL final', async () => {
    const r = await safeFetch(`${base}/red`, { allowPrivate: true });
    expect(r.status).toBe(200);
    expect(r.url).toBe(`${base}/ok`);
    expect(r.body.toString('utf8')).toBe('ola mundo');
  });

  it('303 rebaixa POST para GET; 307 mantém o método', async () => {
    const r303 = await safeFetch(`${base}/red-303`, { method: 'POST', body: 'x', allowPrivate: true });
    expect(r303.body.toString('utf8')).toBe('GET');
    const r307 = await safeFetch(`${base}/red-307`, { method: 'POST', body: 'x', allowPrivate: true });
    expect(r307.body.toString('utf8')).toBe('POST');
  });

  it('usa o resolvedor injetado (nome -> 127.0.0.1)', async () => {
    const lookup = ((hostname: string, options: any, cb: any) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, [{ address: '127.0.0.1', family: 4 }]);
    }) as any;
    const r = await safeFetch(`http://meu.servidor.local:${port}/ok`, { allowPrivate: true, dnsLookup: lookup });
    expect(r.body.toString('utf8')).toBe('ola mundo');
  });
});

describe('safeFetch — bloqueios (allowPrivate false)', () => {
  it('bloqueia IP literal privado', async () => {
    await expect(safeFetch(`${base}/ok`)).rejects.toBeInstanceOf(SecurityError);
  });

  it('bloqueia DNS que resolve para IP privado (rebinding)', async () => {
    const evil = ((hostname: string, options: any, cb: any) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, [{ address: '10.0.0.5', family: 4 }]);
    }) as any;
    await expect(safeFetch('http://site-publico.example/ok', { dnsLookup: evil })).rejects.toBeInstanceOf(SecurityError);
  });

  it('bloqueia DNS que resolve para 169.254.169.254 (metadados de nuvem)', async () => {
    const evil = ((hostname: string, options: any, cb: any) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, [{ address: '169.254.169.254', family: 4 }]);
    }) as any;
    await expect(safeFetch('http://metadata.example/latest', { dnsLookup: evil })).rejects.toBeInstanceOf(SecurityError);
  });

  it('bloqueia IP decimal (2130706433 -> 127.0.0.1) via resolvedor', async () => {
    const evil = ((hostname: string, options: any, cb: any) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, [{ address: '127.0.0.1', family: 4 }]);
    }) as any;
    await expect(safeFetch('http://2130706433/ok', { dnsLookup: evil })).rejects.toBeInstanceOf(SecurityError);
  });

  it('revalida redirecionamento e bloqueia esquema proibido', async () => {
    await expect(safeFetch(`${base}/red-bad-scheme`, { allowPrivate: true })).rejects.toBeInstanceOf(SecurityError);
  });

  it('recusa credenciais na URL', async () => {
    await expect(safeFetch(`http://user:pass@127.0.0.1:${port}/ok`, { allowPrivate: true })).rejects.toBeInstanceOf(SecurityError);
  });
});

describe('safeFetch — limites', () => {
  it('corta por tamanho máximo', async () => {
    await expect(safeFetch(`${base}/big`, { allowPrivate: true, maxBytes: 1000 })).rejects.toBeInstanceOf(SecurityError);
  });

  it('respeita o tempo limite', async () => {
    await expect(safeFetch(`${base}/hang`, { allowPrivate: true, timeoutMs: 250 })).rejects.toBeInstanceOf(SecurityError);
  });

  it('respeita AbortSignal', async () => {
    const ac = new AbortController();
    const p = safeFetch(`${base}/hang`, { allowPrivate: true, signal: ac.signal, timeoutMs: 5000 });
    setTimeout(() => ac.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(SecurityError);
  });
});

describe('isBlockedAddress — IPv6 de transição (revisão)', () => {
  it('bloqueia 6to4, NAT64, Teredo, site-local e documentação que embutem/escondem endereços internos', () => {
    for (const ip of ['2002:7f00:1::', '2002:0a00:0001::', '64:ff9b::7f00:1', '64:ff9b::a00:5', 'fec0::1', '2001:0000:4136:e378:8000:63bf:3fff:fdd2', '2001:db8::1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
  it('não bloqueia 6to4/NAT64 que mapeiam IPs públicos', () => {
    expect(isBlockedAddress('2002:0808:0808::')).toBe(false); // 8.8.8.8
    expect(isBlockedAddress('64:ff9b::0808:0808')).toBe(false); // 8.8.8.8
  });
});

describe('validatePublicUrl — ponto final no host (revisão)', () => {
  it('bloqueia "localhost." e "algo.internal." (FQDN com ponto final)', () => {
    expect(() => validatePublicUrl('http://localhost./')).toThrow(SecurityError);
    expect(() => validatePublicUrl('http://servico.internal./')).toThrow(SecurityError);
  });
  it('aceita host público com ponto final', () => {
    expect(validatePublicUrl('http://exemplo.com./').hostname).toBe('exemplo.com.');
  });
});
