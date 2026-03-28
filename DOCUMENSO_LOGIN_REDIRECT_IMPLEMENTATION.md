# Documenso Login Redirect Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing automatic redirect-after-login functionality in your self-hosted Documenso instance. This will allow users who access document editor links while unauthenticated to be automatically redirected back to the document after logging in.

## Problem

Users clicking document editing links (e.g., `/t/personal_xxx/documents/envelope_xxx/edit?step=addFields`) while not logged in are redirected to `/signin`. After successful authentication, they are not automatically returned to the original document URL.

## Solution

Implement middleware to capture the original destination URL before redirecting to login, then redirect to that URL after successful authentication.

---

## Architecture Overview

```
User clicks document link (unauthenticated)
  ↓
Middleware detects unauthenticated request
  ↓
Captures current URL as returnUrl
  ↓
Redirects to: /signin?returnUrl=<encoded_url>
  ↓
User authenticates
  ↓
Post-auth handler checks for returnUrl
  ↓
Validates returnUrl (security check)
  ↓
Redirects to returnUrl → User lands on document editor
```

---

## Implementation Steps

### Step 1: Identify Documenso's Tech Stack

Documenso is built with:
- **Framework**: Next.js (App Router)
- **Auth**: NextAuth.js (likely)
- **Language**: TypeScript

**Files to locate:**
- `apps/web/src/app/signin/page.tsx` - Sign in page
- `apps/web/src/middleware.ts` - Next.js middleware (may already exist)
- NextAuth configuration file (e.g., `apps/web/src/lib/auth.ts` or similar)

---

### Step 2: Create or Modify Authentication Middleware

**File**: `apps/web/src/middleware.ts`

If this file doesn't exist, create it. This middleware will run before every request.

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Protected routes that require authentication
  const protectedPaths = [
    '/documents',
    '/t/',  // Team routes
    '/settings',
    // Add other protected paths
  ];

  // Check if current path is protected
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  // Check authentication status
  // Note: Replace with your actual auth check method
  const token = request.cookies.get('next-auth.session-token')
                || request.cookies.get('__Secure-next-auth.session-token');

  const isAuthenticated = !!token;

  if (!isAuthenticated) {
    // User is not authenticated, redirect to signin with return URL
    const returnUrl = encodeURIComponent(pathname + search);
    const signinUrl = new URL('/signin', request.url);
    signinUrl.searchParams.set('returnUrl', returnUrl);

    return NextResponse.redirect(signinUrl);
  }

  // User is authenticated, allow access
  return NextResponse.next();
}

// Configure which routes this middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - signin, signup (auth pages)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public|signin|signup).*)',
  ],
};
```

**Key points:**
- Captures full URL including query parameters (`pathname + search`)
- Encodes URL to prevent issues with special characters
- Only redirects if user is not authenticated
- Preserves original destination in `returnUrl` query parameter

---

### Step 3: Modify Sign In Page to Handle Return URL

**File**: `apps/web/src/app/signin/page.tsx` (or equivalent)

Update the sign-in page to:
1. Extract `returnUrl` from query parameters
2. Pass it through the authentication flow
3. Redirect after successful authentication

```typescript
'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignInPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Get return URL from query parameters
  const returnUrl = searchParams.get('returnUrl');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false, // Don't redirect automatically
      });

      if (result?.error) {
        setError('Invalid credentials');
        setIsLoading(false);
        return;
      }

      if (result?.ok) {
        // Validate and redirect to return URL
        const destination = getValidatedReturnUrl(returnUrl);
        router.push(destination);
      }
    } catch (err) {
      setError('An error occurred during sign in');
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h1>Sign In</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

/**
 * Validates and sanitizes return URL to prevent open redirect attacks
 */
function getValidatedReturnUrl(returnUrl: string | null): string {
  // Default redirect if no return URL
  const DEFAULT_DESTINATION = '/documents';

  if (!returnUrl) {
    return DEFAULT_DESTINATION;
  }

  try {
    // Decode the URL
    const decoded = decodeURIComponent(returnUrl);

    // Ensure it's a relative URL (starts with /)
    if (!decoded.startsWith('/')) {
      console.warn('Invalid return URL (not relative):', decoded);
      return DEFAULT_DESTINATION;
    }

    // Prevent protocol-relative URLs (//example.com)
    if (decoded.startsWith('//')) {
      console.warn('Invalid return URL (protocol-relative):', decoded);
      return DEFAULT_DESTINATION;
    }

    // Additional validation: Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(decoded))) {
      console.warn('Invalid return URL (suspicious pattern):', decoded);
      return DEFAULT_DESTINATION;
    }

    // URL is valid
    return decoded;

  } catch (error) {
    console.error('Error validating return URL:', error);
    return DEFAULT_DESTINATION;
  }
}
```

**Security considerations implemented:**
- Only accepts relative URLs (starting with `/`)
- Rejects protocol-relative URLs (`//evil.com`)
- Blocks JavaScript and data URIs
- Falls back to safe default if validation fails
- Logs suspicious attempts for monitoring

---

### Step 4: Update NextAuth Configuration (If Applicable)

If Documenso uses NextAuth.js, you may need to configure callbacks to handle the redirect.

**File**: `apps/web/src/lib/auth.ts` (or wherever NextAuth is configured)

```typescript
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Your existing authentication logic
        // ...
      }
    })
  ],
  pages: {
    signIn: '/signin', // Custom sign-in page
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // If url is provided and is relative, use it
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      // If url is from same site, use it
      else if (new URL(url).origin === baseUrl) {
        return url;
      }
      // Otherwise redirect to base URL
      return baseUrl;
    },
    // Other callbacks...
  },
};

export default NextAuth(authOptions);
```

---

### Step 5: Alternative Approach (If Not Using Middleware)

If you prefer not to use Next.js middleware, you can implement the redirect logic directly in your authentication guard or page components.

**Create a higher-order component or hook:**

```typescript
// hooks/useAuthGuard.ts
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function useAuthGuard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      // Build return URL
      const search = searchParams.toString();
      const fullPath = search ? `${pathname}?${search}` : pathname;
      const returnUrl = encodeURIComponent(fullPath);

      // Redirect to signin with return URL
      router.push(`/signin?returnUrl=${returnUrl}`);
    }
  }, [status, router, pathname, searchParams]);

  return { session, status };
}
```

**Use in protected pages:**

```typescript
// app/documents/[id]/edit/page.tsx
'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

export default function DocumentEditPage() {
  const { session, status } = useAuthGuard();

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (!session) {
    return null; // Will redirect via useAuthGuard
  }

  return (
    <div>
      {/* Your document editor UI */}
    </div>
  );
}
```

---

## Testing Checklist

### Test 1: Unauthenticated Access
- [ ] Open document editor URL while logged out
- [ ] Verify redirect to `/signin?returnUrl=<encoded_url>`
- [ ] Check that `returnUrl` is properly URL-encoded
- [ ] Sign in successfully
- [ ] Verify automatic redirect to original document URL
- [ ] Verify all query parameters are preserved (e.g., `?step=addFields`)

### Test 2: Authenticated Access
- [ ] Open document editor URL while logged in
- [ ] Verify direct access (no redirect to signin)
- [ ] Verify document editor loads correctly

### Test 3: Security Validation
- [ ] Manually craft URL: `/signin?returnUrl=//evil.com`
- [ ] Sign in
- [ ] Verify redirect to default page, NOT evil.com
- [ ] Try: `/signin?returnUrl=javascript:alert('XSS')`
- [ ] Verify redirect to default page
- [ ] Check server logs for security warnings

### Test 4: Edge Cases
- [ ] Access `/signin` without `returnUrl` parameter
- [ ] Sign in
- [ ] Verify redirect to default dashboard/documents page
- [ ] Test with complex URLs containing special characters
- [ ] Test with URLs containing multiple query parameters
- [ ] Test with URLs containing hash fragments (`#section`)

### Test 5: Different Document URL Patterns
Test all URL patterns used in JustX:
- [ ] With team URL: `/t/personal_xxx/documents/envelope_xxx/edit?step=addFields`
- [ ] Without team URL: `/documents/envelope_xxx/edit?step=addFields`

---

## Troubleshooting

### Issue: Redirect loop (signin → document → signin → ...)

**Cause**: Authentication check is incorrectly identifying authenticated users as unauthenticated.

**Solution**:
- Verify cookie names in middleware match NextAuth session cookies
- Check if session token is being set correctly after signin
- Ensure middleware is reading cookies from the right domain/path

### Issue: Return URL not preserved

**Cause**: URL encoding/decoding mismatch.

**Solution**:
- Use `encodeURIComponent()` when creating return URL
- Use `decodeURIComponent()` when reading return URL
- Check for double-encoding issues

### Issue: User redirected to default page instead of return URL

**Cause**: Return URL validation is rejecting valid URLs.

**Solution**:
- Add logging to `getValidatedReturnUrl()` function
- Check console for validation warnings
- Verify URL pattern matches expected format

### Issue: NextAuth overwrites redirect behavior

**Cause**: NextAuth's default redirect logic conflicts with custom implementation.

**Solution**:
- Set `redirect: false` in `signIn()` call
- Manually handle redirect after successful signin
- Or configure NextAuth's `redirect` callback properly

---

## Security Best Practices

1. **Always validate return URLs**:
   - Only allow same-origin redirects
   - Reject absolute URLs to external domains
   - Reject JavaScript/data URIs

2. **Use URL encoding**:
   - Encode return URLs when adding to query parameters
   - Decode safely with try-catch

3. **Log suspicious attempts**:
   - Monitor for open redirect attack attempts
   - Alert on repeated failures from same IP

4. **Set secure cookie flags**:
   - Ensure NextAuth cookies use `httpOnly`, `secure`, `sameSite`

5. **Rate limit signin attempts**:
   - Prevent brute force attacks
   - Consider adding CAPTCHA after failed attempts

---

## Monitoring and Logging

Add logging to track redirect flow:

```typescript
// Log in middleware
console.log('[AUTH] Unauthenticated access to:', pathname + search);
console.log('[AUTH] Redirecting to signin with returnUrl:', returnUrl);

// Log in signin page
console.log('[AUTH] Signin attempt with returnUrl:', returnUrl);

// Log validation results
console.log('[AUTH] Validated returnUrl:', validatedUrl);

// Log successful redirect
console.log('[AUTH] Successful redirect to:', destination);
```

Consider using a proper logging library (e.g., Pino, Winston) for production.

---

## Rollback Plan

If issues occur:

1. **Remove middleware changes**:
   - Delete or comment out redirect logic in `middleware.ts`
   - Users will see original behavior (no auto-redirect)

2. **Remove signin page changes**:
   - Revert to previous signin page version
   - Remove return URL handling

3. **Restore default NextAuth behavior**:
   - Remove custom redirect callback
   - Let NextAuth use default post-signin redirect

---

## Additional Resources

- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [NextAuth.js Callbacks](https://next-auth.js.org/configuration/callbacks)
- [OWASP: Unvalidated Redirects and Forwards](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)

---

## Summary

After implementation:
1. Unauthenticated users accessing document links will be redirected to signin
2. Return URL will be preserved in query parameters
3. After successful authentication, users will be automatically redirected to the original document
4. Security validation prevents open redirect attacks
5. Default behavior is preserved for direct signin page access

This creates a seamless user experience while maintaining security best practices.
