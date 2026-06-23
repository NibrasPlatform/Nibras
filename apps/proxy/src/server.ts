import fs from 'node:fs';
import http, { IncomingMessage, Server, ServerResponse } from 'node:http';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import httpProxy from 'http-proxy';

export type ProxyConfig = {
  host: string;
  port: number;
  fastifyOrigin: string;
  nestjsOrigin: string;
  webOrigin: string;
  staticRoot: string | null;
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.map': 'application/json',
};

function loadConfig(): ProxyConfig {
  const staticRootEnv = process.env.NIBRAS_STATIC_ROOT?.trim();
  return {
    host:
      process.env.NIBRAS_PROXY_HOST ||
      process.env.NIBRAS_GATEWAY_HOST ||
      '127.0.0.1',
    port: Number(
      process.env.NIBRAS_PROXY_PORT ||
        process.env.NIBRAS_GATEWAY_PORT ||
        process.env.PORT ||
        '8080',
    ),
    fastifyOrigin:
      process.env.NIBRAS_FASTIFY_ORIGIN ||
      process.env.NIBRAS_LOCAL_API_ORIGIN ||
      'http://127.0.0.1:4848',
    nestjsOrigin: process.env.NIBRAS_NESTJS_ORIGIN || 'http://127.0.0.1:3000',
    webOrigin: process.env.NIBRAS_LOCAL_WEB_ORIGIN || 'http://127.0.0.1:3000',
    staticRoot: staticRootEnv
      ? path.resolve(process.cwd(), staticRootEnv)
      : null,
  };
}

const PLATFORM_ADMIN_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-otp',
  '/api/auth/refresh-tokens',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/change-password',
  '/api/auth/google',
  '/api/auth/microsoft',
]);

function isPlatformAdminAuthRequest(url = '/'): boolean {
  const pathname = new URL(url, 'http://localhost').pathname;
  return PLATFORM_ADMIN_AUTH_PATHS.has(pathname);
}

const COMPETITIONS_API_PREFIXES = [
  '/contests',
  '/user-contests',
  '/problems',
  '/ranking',
  '/practice',
  '/integrations',
  '/nibras75',
  '/cp-roadmap',
  '/daily-problem',
] as const;

function isCompetitionsApiPath(pathname: string): boolean {
  return COMPETITIONS_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function rewriteLegacyApiPath(url = '/'): {
  url: string;
  forceFastify: boolean;
} {
  const parsed = new URL(url, 'http://localhost');
  const { pathname } = parsed;

  if (pathname.startsWith('/community/')) {
    parsed.pathname = `/v1${pathname}`;
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  if (pathname === '/flags' || pathname.startsWith('/flags/')) {
    parsed.pathname =
      pathname === '/flags'
        ? '/v1/community/reports'
        : pathname.replace(/^\/flags/, '/v1/community/reports');
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  if (pathname === '/moderation/queue') {
    parsed.pathname = '/v1/community/reports';
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  const moderationResolve = pathname.match(
    /^\/moderation\/flags\/([^/]+)\/resolve$/,
  );
  if (moderationResolve) {
    parsed.pathname = `/v1/community/reports/${moderationResolve[1]}`;
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  if (isCompetitionsApiPath(pathname)) {
    parsed.pathname = pathname.startsWith('/integrations')
      ? `/v1/competitions${pathname}`
      : `/v1${pathname}`;
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
    parsed.pathname = pathname.replace(/^\/api\/admin/, '/v1/admin');
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  if (
    pathname === '/api/gamification' ||
    pathname.startsWith('/api/gamification/')
  ) {
    parsed.pathname = pathname.replace(/^\/api\/gamification/, '/v1/gamification');
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
    parsed.pathname = pathname.replace(/^\/api/, '');
    return { url: `${parsed.pathname}${parsed.search}`, forceFastify: true };
  }

  return { url, forceFastify: false };
}

export { rewriteLegacyApiPath };

function isFastifyRequest(url = '/'): boolean {
  const rewritten = rewriteLegacyApiPath(url);
  if (rewritten.forceFastify) {
    return true;
  }
  return (
    url === '/v1' ||
    url.startsWith('/v1/') ||
    url === '/dev' ||
    url.startsWith('/dev/') ||
    url === '/healthz' ||
    url.startsWith('/healthz') ||
    url === '/readyz' ||
    url.startsWith('/readyz') ||
    url === '/metrics' ||
    url.startsWith('/metrics')
  );
}

function isNestjsRequest(url = '/'): boolean {
  return (
    url === '/api' ||
    url.startsWith('/api/') ||
    url === '/socket.io' ||
    url.startsWith('/socket.io/')
  );
}

function pickTarget(
  url: string | undefined,
  config: ProxyConfig,
): string | null {
  if (isFastifyRequest(url) || isPlatformAdminAuthRequest(url)) {
    return config.fastifyOrigin;
  }
  if (isNestjsRequest(url)) {
    return config.nestjsOrigin;
  }
  if (config.staticRoot) {
    return null;
  }
  return config.webOrigin;
}

function isServerResponse(
  value: unknown,
): value is ServerResponse<IncomingMessage> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'writeHead' in value &&
    'end' in value
  );
}

function resolveStaticPath(root: string, requestUrl = '/'): string | null {
  const parsed = new URL(requestUrl, 'http://localhost');
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  const resolved = path.resolve(root, `.${pathname}`);
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

function serveStaticFile(
  filePath: string,
  response: ServerResponse<IncomingMessage>,
): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return false;
    }
    return serveStaticFile(indexPath, response);
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers: Record<string, string> = {
    'content-type': MIME_TYPES[ext] || 'application/octet-stream',
  };
  if (ext === '.js' || ext === '.html') {
    headers['cache-control'] = 'no-cache';
  }
  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
  return true;
}

function buildAzureServicesConfigScript(): string {
  return buildOAuthConfigScript();
}

function serveAzureServicesConfig(response: ServerResponse<IncomingMessage>): void {
  response.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-cache',
  });
  response.end(buildAzureServicesConfigScript());
}

function buildOAuthConfigScript(): string {
  const googleClientId = (process.env.NIBRAS_GOOGLE_CLIENT_ID || '').trim();
  const microsoftClientId = (
    process.env.NIBRAS_MICROSOFT_CLIENT_ID || ''
  ).trim();
  const coursesApi = (process.env.NIBRAS_COURSES_API_URL || '').trim();
  const recommendationApi = (
    process.env.NIBRAS_RECOMMENDATION_API_URL || ''
  ).trim();
  const lines = ['window.NibrasApiConfig = window.NibrasApiConfig || {};'];
  if (googleClientId) {
    lines.push(
      `window.NIBRAS_GOOGLE_CLIENT_ID = ${JSON.stringify(googleClientId)};`,
    );
    lines.push(
      `window.NibrasApiConfig.googleClientId = ${JSON.stringify(googleClientId)};`,
    );
  }
  if (microsoftClientId) {
    lines.push(
      `window.NIBRAS_MICROSOFT_CLIENT_ID = ${JSON.stringify(microsoftClientId)};`,
    );
    lines.push(
      `window.NibrasApiConfig.microsoftClientId = ${JSON.stringify(microsoftClientId)};`,
    );
  }
  if (coursesApi) {
    lines.push(
      `window.NIBRAS_AZURE_COURSES_API = ${JSON.stringify(coursesApi)};`,
    );
  }
  if (recommendationApi) {
    lines.push(
      `window.NIBRAS_AZURE_RECOMMENDATION_API = ${JSON.stringify(recommendationApi)};`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function serveOAuthConfig(response: ServerResponse<IncomingMessage>): void {
  response.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-cache',
  });
  response.end(buildOAuthConfigScript());
}

function handleStaticRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  config: ProxyConfig,
): void {
  if (!config.staticRoot) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const filePath = resolveStaticPath(config.staticRoot, request.url || '/');
  if (!filePath || !serveStaticFile(filePath, response)) {
    const fallback = path.join(config.staticRoot, 'index.html');
    if (serveStaticFile(fallback, response)) {
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

export function buildProxyServer(config: Partial<ProxyConfig> = {}): Server {
  const resolved = { ...loadConfig(), ...config };
  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    ws: true,
    xfwd: true,
  });

  proxy.on('error', (error, _request, response) => {
    if (!isServerResponse(response) || response.headersSent) {
      return;
    }
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: `Proxy request failed: ${error.message}`,
      }),
    );
  });

  const server = http.createServer((request, response) => {
    const originalUrl = request.url || '/';
    const pathname = new URL(originalUrl, 'http://localhost').pathname;
    if (pathname === '/oauth-config.js') {
      serveOAuthConfig(response);
      return;
    }
    if (pathname === '/azure-services-config.js') {
      serveAzureServicesConfig(response);
      return;
    }

    const rewritten = rewriteLegacyApiPath(originalUrl);
    if (rewritten.url !== originalUrl) {
      request.url = rewritten.url;
    }

    const target = pickTarget(request.url, resolved);
    if (!target) {
      handleStaticRequest(request, response, resolved);
      return;
    }
    proxy.web(request, response, { target });
  });

  server.on('upgrade', (request, socket, head) => {
    const target = pickTarget(request.url, resolved) || resolved.nestjsOrigin;
    proxy.ws(request, socket, head, { target });
  });

  return server;
}

async function startServer(): Promise<void> {
  const config = loadConfig();
  const server = buildProxyServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  const boundHost = address?.address || config.host;
  const boundPort = address?.port || config.port;
  console.log(`Nibras gateway listening on http://${boundHost}:${boundPort}`);
  console.log(`Fastify origin: ${config.fastifyOrigin}`);
  console.log(`NestJS origin: ${config.nestjsOrigin}`);
  if (config.staticRoot) {
    console.log(`Static root: ${config.staticRoot}`);
  } else {
    console.log(`Web origin: ${config.webOrigin}`);
  }
}

if (require.main === module) {
  void startServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
