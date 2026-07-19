import { Check } from 'lucide-react';

const steps = ['Dados do produto', 'Adicionais'];

export function ProductSetupProgress({ currentStep }: { currentStep: 1 | 2 }) {
  return (
    <nav aria-label="Etapas de configuração do produto" className="mb-5">
      <ol className="grid grid-cols-2 gap-2">
        {steps.map((label, index) => {
          const step = (index + 1) as 1 | 2;
          const complete = step < currentStep;
          const current = step === currentStep;
          return (
            <li
              key={label}
              className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                current ? 'bg-surface-secondary' : ''
              }`}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={
                  complete || current
                    ? 'bg-brand-600 flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold text-white'
                    : 'bg-surface-tertiary text-text-secondary flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold'
                }
              >
                {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : step}
              </span>
              <span
                className={`min-w-0 leading-tight ${current ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
