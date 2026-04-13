import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  data,
  isRouteErrorResponse,
  useLoaderData,
} from 'react-router';
import { PreventFlashOnWrongTheme, ThemeProvider, useTheme } from 'remix-themes';

import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { SessionProvider } from '@documenso/lib/client-only/providers/session';
import { APP_I18N_OPTIONS, type SupportedLanguageCodes } from '@documenso/lib/constants/i18n';
import { createPublicEnv } from '@documenso/lib/utils/env';
import { extractLocaleData } from '@documenso/lib/utils/i18n';
import { TrpcProvider } from '@documenso/trpc/react';
import { getOrganisationSession } from '@documenso/trpc/server/organisation-router/get-organisation-session';
import { Toaster } from '@documenso/ui/primitives/toaster';
import { TooltipProvider } from '@documenso/ui/primitives/tooltip';

import type { Route } from './+types/root';
import stylesheet from './app.css?url';
import { GenericErrorLayout } from './components/general/generic-error-layout';
import { langCookie } from './storage/lang-cookie.server';
import { themeSessionResolver } from './storage/theme-session.server';
import { appMetaTags } from './utils/meta';

/** Favicon por tema do SO: claro → blackicon, escuro → whiteicon (`public/static/`). */
const JUSTX_FAVICON_SYNC_SCRIPT = `
(function syncFaviconForColorScheme() {
  function apply() {
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var name = dark ? 'whiteicon.png' : 'blackicon.png';
    var link = document.querySelector('link[data-justx-favicon]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.setAttribute('data-justx-favicon', '1');
      document.head.appendChild(link);
    }
    link.href = '/static/' + name;
  }
  apply();
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', apply);
  else if (typeof mq.addListener === 'function') mq.addListener(apply);
})();
`.trim();

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: stylesheet }];

export function meta() {
  return appMetaTags();
}

/**
 * Don't revalidate (run the loader on sequential navigations) on the root layout
 *
 * Update values via providers.
 */
export const shouldRevalidate = () => false;

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getOptionalSession(request);

  const { getTheme } = await themeSessionResolver(request);

  const cookieHeader = request.headers.get('cookie') ?? '';

  let lang: SupportedLanguageCodes = await langCookie.parse(cookieHeader);

  if (!APP_I18N_OPTIONS.supportedLangs.includes(lang)) {
    lang = extractLocaleData({ headers: request.headers }).lang;
  }

  const disableAnimations = cookieHeader.includes('__disable_animations=true');

  let organisations = null;

  if (session.isAuthenticated) {
    organisations = await getOrganisationSession({ userId: session.user.id });
  }

  const publicEnv: Record<string, string | undefined> = { ...createPublicEnv() };
  try {
    const requestUrl = new URL(request.url);
    const host = requestUrl.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      publicEnv.NEXT_PUBLIC_WEBAPP_URL = requestUrl.origin;
    }
  } catch {
    // ignore malformed request URL
  }

  return data(
    {
      lang,
      theme: getTheme(),
      disableAnimations,
      session: session.isAuthenticated
        ? {
            user: session.user,
            session: session.session,
            organisations: organisations || [],
          }
        : null,
      publicEnv,
    },
    {
      headers: {
        'Set-Cookie': await langCookie.serialize(lang),
      },
    },
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme } = useLoaderData<typeof loader>() || {};

  return (
    <ThemeProvider specifiedTheme={theme} themeAction="/api/theme">
      <LayoutContent>{children}</LayoutContent>
    </ThemeProvider>
  );
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const { publicEnv, session, lang, disableAnimations, ...data } =
    useLoaderData<typeof loader>() || {};

  const [theme] = useTheme();

  return (
    <html translate="no" lang={lang} data-theme={theme} className={theme ?? ''}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JUSTX_FAVICON_SYNC_SCRIPT }}
        />
        <Links />
        <meta name="google" content="notranslate" />
        <Meta />
        <meta name="google" content="notranslate" />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(data.theme)} />

        {disableAnimations && (
          <style
            dangerouslySetInnerHTML={{
              __html: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
            }}
          />
        )}

        {/* Fix: https://stackoverflow.com/questions/21147149/flash-of-unstyled-content-fouc-in-firefox-only-is-ff-slow-renderer */}
        <script>0</script>
      </head>
      <body>
        {/* Global license banner currently disabled. Need to wait until after a few releases. */}
        {/* {licenseStatus === '?' && (
          <div className="bg-destructive text-destructive-foreground">
            <div className="mx-auto flex h-auto max-w-screen-xl items-center justify-center px-4 py-3 text-sm font-medium">
              <div className="flex items-center">
                <AlertTriangleIcon className="mr-2 h-4 w-4" />
                <Trans>This is an expired license instance of Documenso</Trans>
              </div>
            </div>
          </div>
        )} */}

        <SessionProvider initialSession={session}>
          <TooltipProvider>
            <TrpcProvider>
              {children}

              <Toaster />
            </TrpcProvider>
          </TooltipProvider>
        </SessionProvider>

        <ScrollRestoration />
        <Scripts />

        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__ = ${JSON.stringify(publicEnv)}`,
          }}
        />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const errorCode = isRouteErrorResponse(error) ? error.status : 500;

  if (errorCode !== 404) {
    console.error('[RootErrorBoundary]', error);
  }

  return <GenericErrorLayout errorCode={errorCode} />;
}
