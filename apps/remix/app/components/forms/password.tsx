import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useForm } from 'react-hook-form';
import { match } from 'ts-pattern';
import { z } from 'zod';

import { authClient } from '@documenso/auth/client';
import type { SessionUser } from '@documenso/auth/server/lib/session/session';
import { AppError } from '@documenso/lib/errors/app-error';
import { ZCurrentPasswordSchema, ZPasswordSchema } from '@documenso/trpc/server/auth-router/schema';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@documenso/ui/primitives/form/form';
import { PasswordInput } from '@documenso/ui/primitives/password-input';
import { useToast } from '@documenso/ui/primitives/use-toast';

const ZChangePasswordFormSchema = z
  .object({
    currentPassword: ZCurrentPasswordSchema,
    password: ZPasswordSchema,
    repeatedPassword: ZPasswordSchema,
  })
  .refine((data) => data.password === data.repeatedPassword, {
    message: 'Passwords do not match',
    path: ['repeatedPassword'],
  });

const ZSetPasswordFormSchema = z
  .object({
    password: ZPasswordSchema,
    repeatedPassword: ZPasswordSchema,
  })
  .refine((data) => data.password === data.repeatedPassword, {
    message: 'Passwords do not match',
    path: ['repeatedPassword'],
  });

export const ZPasswordFormSchema = ZChangePasswordFormSchema;
export type TPasswordFormSchema = z.infer<typeof ZChangePasswordFormSchema>;

export type PasswordFormProps = {
  className?: string;
  user: SessionUser;
  hasPassword?: boolean;
};

export const PasswordForm = ({ className, hasPassword = true }: PasswordFormProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const changeForm = useForm<z.infer<typeof ZChangePasswordFormSchema>>({
    values: { currentPassword: '', password: '', repeatedPassword: '' },
    resolver: zodResolver(ZChangePasswordFormSchema),
  });

  const setForm = useForm<z.infer<typeof ZSetPasswordFormSchema>>({
    values: { password: '', repeatedPassword: '' },
    resolver: zodResolver(ZSetPasswordFormSchema),
  });

  const form = hasPassword ? changeForm : setForm;
  const isSubmitting = form.formState.isSubmitting;

  const onFormSubmit = async (
    data: z.infer<typeof ZChangePasswordFormSchema> | z.infer<typeof ZSetPasswordFormSchema>,
  ) => {
    const currentPassword = 'currentPassword' in data ? data.currentPassword : undefined;
    const { password } = data;
    try {
      await authClient.emailPassword.updatePassword({
        currentPassword,
        password,
      });

      form.reset();

      toast({
        title: _(msg`Password updated`),
        description: _(msg`Your password has been updated successfully.`),
        duration: 5000,
      });
    } catch (err) {
      const error = AppError.parseError(err);

      const errorMessage = match(error.code)
        .with('NO_PASSWORD', () => msg`User has no password.`)
        .with('INCORRECT_PASSWORD', () => msg`Current password is incorrect.`)
        .with(
          'SAME_PASSWORD',
          () => msg`Your new password cannot be the same as your old password.`,
        )
        .otherwise(
          () =>
            msg`We encountered an unknown error while attempting to update your password. Please try again later.`,
        );

      toast({
        title: _(msg`An error occurred`),
        description: _(errorMessage),
        variant: 'destructive',
      });
    }
  };

  return (
    <Form {...(form as typeof setForm)}>
      <form
        className={cn('flex w-full flex-col gap-y-4', className)}
        onSubmit={form.handleSubmit(onFormSubmit as Parameters<typeof setForm.handleSubmit>[0])}
      >
        <fieldset className="flex w-full flex-col gap-y-4" disabled={isSubmitting}>
          {hasPassword && (
            <FormField
              control={changeForm.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans>Current Password</Trans>
                  </FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control as typeof setForm.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {hasPassword ? <Trans>New Password</Trans> : <Trans>Password</Trans>}
                </FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control as typeof setForm.control}
            name="repeatedPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Repeat Password</Trans>
                </FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        <div className="ml-auto mt-4">
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? (
              hasPassword ? (
                <Trans>Updating password...</Trans>
              ) : (
                <Trans>Setting password...</Trans>
              )
            ) : hasPassword ? (
              <Trans>Update password</Trans>
            ) : (
              <Trans>Set password</Trans>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};
