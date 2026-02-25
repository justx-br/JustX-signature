import type { ImgHTMLAttributes } from 'react';

import Logo from '@documenso/assets/logo.svg';
import { cn } from '@documenso/ui/lib/utils';

export type LogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>;

export const BrandingLogo = ({ className, ...props }: LogoProps) => {
  return (
    <img
      src={Logo}
      alt="JustX"
      className={cn('h-8 w-auto object-contain object-left', className)}
      {...props}
    />
  );
};
