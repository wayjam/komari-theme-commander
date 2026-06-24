import { cloneElement, useState, useEffect, useCallback, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function hasOverflow(element: HTMLElement) {
  const tolerance = 1;
  return (
    element.scrollWidth > element.clientWidth + tolerance ||
    element.scrollHeight > element.clientHeight + tolerance
  );
}

export function OverflowTooltip({
  children,
  content,
  side = 'bottom',
  contentClassName,
}: {
  children: ReactElement<React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>>;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  contentClassName?: string;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  const updateOverflow = useCallback(() => {
    const next = triggerRef.current ? hasOverflow(triggerRef.current) : false;
    setIsOverflowing(next);
    if (!next) setOpen(false);
    return next;
  }, []);

  useEffect(() => {
    updateOverflow();
    const element = triggerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateOverflow();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [updateOverflow, content]);

  const trigger = useMemo(
    () => cloneElement(children, {
      ref: (element: HTMLElement | null) => {
        triggerRef.current = element;
        const { ref } = children.props;
        if (typeof ref === 'function') {
          ref(element);
        } else if (ref && typeof ref === 'object') {
          ref.current = element;
        }
      },
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
        updateOverflow();
        children.props.onPointerEnter?.(event);
      },
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        updateOverflow();
        children.props.onFocus?.(event);
      },
    }),
    [children, updateOverflow],
  );

  return (
    <Tooltip open={isOverflowing ? open : false} onOpenChange={(nextOpen) => {
      const nextOverflow = updateOverflow();
      setOpen(nextOverflow ? nextOpen : false);
    }}>
      <TooltipTrigger asChild>
        {trigger}
      </TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
