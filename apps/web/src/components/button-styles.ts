// Classes do botão num arquivo à parte: o `Link` que parece botão ("Nova ordem", "Editar")
// usa as mesmas, e arquivo de componente só pode exportar componentes (fast refresh).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-control-border bg-surface hover:bg-surface-muted',
  ghost: 'text-text hover:bg-surface-muted',
  danger: 'border border-danger-border bg-danger-bg text-danger hover:border-danger',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}`;
}
