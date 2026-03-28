import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';

const getWebappOrigin = () => {
  try {
    return new URL(NEXT_PUBLIC_WEBAPP_URL()).origin;
  } catch {
    return NEXT_PUBLIC_WEBAPP_URL();
  }
};

export const isValidReturnTo = (returnTo?: string) => {
  if (!returnTo) {
    return false;
  }

  try {
    const decodedReturnTo = decodeURIComponent(returnTo);
    const returnToUrl = new URL(decodedReturnTo, NEXT_PUBLIC_WEBAPP_URL());

    if (returnToUrl.origin !== getWebappOrigin()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export const normalizeReturnTo = (returnTo?: string) => {
  if (!returnTo) {
    return undefined;
  }

  try {
    const decodedReturnTo = decodeURIComponent(returnTo);
    const returnToUrl = new URL(decodedReturnTo, NEXT_PUBLIC_WEBAPP_URL());

    return `${returnToUrl.pathname}${returnToUrl.search}${returnToUrl.hash}`;
  } catch {
    return undefined;
  }
};
