import type { ImgHTMLAttributes } from 'react';

import { useTheme } from 'remix-themes';

import Logo from '@documenso/assets/logo.svg';
import { cn } from '@documenso/ui/lib/utils';

export type LogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>;

export const BrandingLogoIcon = ({ className, ...props }: LogoProps) => {
  const [theme] = useTheme();
  const isDark = theme === 'dark';

  return (
    <img
      src={isDark ? Logo : '/static/justxlogoblack.png'}
      alt="Justx"
      className={cn('h-8 w-auto object-contain', className)}
      {...props}
    />
  );
};
