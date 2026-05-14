import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn('w-full', className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        if (child.type === TabsList) {
          return React.cloneElement(child as React.ReactElement<TabsListProps>, { value, onValueChange });
        }
        if (child.type === TabsContent) {
          return React.cloneElement(child as React.ReactElement<TabsContentProps>, { activeValue: value });
        }
        return child;
      })}
    </div>
  );
}

interface TabsListProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function TabsList({ value, onValueChange, children, className }: TabsListProps) {
  return (
    <div className={cn('flex w-full space-x-1 overflow-x-auto rounded-lg bg-zinc-100 p-1', className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child) || child.type !== TabsTrigger) return child;
        const triggerChild = child as React.ReactElement<TabsTriggerProps>;
        return React.cloneElement(triggerChild, {
          active: triggerChild.props.value === value,
          onClick: () => onValueChange?.(triggerChild.props.value),
        });
      })}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

function TabsTrigger({ active, onClick, children, className }: TabsTriggerProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all sm:flex-1',
        active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700',
        className
      )}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  activeValue?: string;
  children: React.ReactNode;
  className?: string;
}

function TabsContent({ value, activeValue, children, className }: TabsContentProps) {
  if (value !== activeValue) return null;
  return <div className={cn('mt-4', className)}>{children}</div>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
