import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4 border-b border-gray-100', className)} {...props}>{children}</div>;
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props}>{children}</div>;
}
