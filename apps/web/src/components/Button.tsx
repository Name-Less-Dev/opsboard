import type { ComponentProps } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles';

// `ComponentProps<'button'>` inclui `ref` (no React 19, uma prop comum).
export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      // `type="button"` por padrão: um botão dentro de <form> não envia o formulário sem querer.
      type={type}
      className={`${buttonClass(variant, size)} ${className}`}
      {...props}
    />
  );
}
