import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react-native';
import {
  Children,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  Linking,
  Modal,
  Pressable,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';

import { Badge } from '@/components/ui/badge';
import { useControllableState } from '@/hooks/use-controllable-state';
import { cn } from '@/lib/utils';

export type InlineCitationProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitation = ({ className, ...props }: InlineCitationProps) => (
  <View className={cn('flex-row flex-wrap items-center gap-1', className)} {...props} />
);

export type InlineCitationTextProps = TextProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationText = ({ className, ...props }: InlineCitationTextProps) => (
  <Text className={cn('text-zinc-900', className)} {...props} />
);

function getHostname(value: string): string | null {
  const match = value.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/([^/?#]+)/);
  if (match?.[1]) {
    return match[1].replace(/^www\./, '');
  }
  const withoutProtocol = value.replace(/^\/\//, '').split(/[/?#]/)[0];
  return withoutProtocol.length > 0 ? withoutProtocol : null;
}

const InlineCitationCardContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

const useInlineCitationCard = () => {
  const context = useContext(InlineCitationCardContext);
  if (!context) {
    throw new Error('Inline citation card components must be used within InlineCitationCard');
  }
  return context;
};

export type InlineCitationCardProps = {
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const InlineCitationCard = ({
  children,
  open,
  defaultOpen = false,
  onOpenChange,
}: InlineCitationCardProps) => {
  const [isOpen, setIsOpen] = useControllableState<boolean>({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });

  return (
    <InlineCitationCardContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      {children}
    </InlineCitationCardContext.Provider>
  );
};

export type InlineCitationCardTriggerProps = {
  sources: string[];
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCardTrigger = ({
  sources,
  className,
  children,
}: InlineCitationCardTriggerProps) => {
  const { open, setOpen } = useInlineCitationCard();
  const hostname = sources[0] ? getHostname(sources[0]) : null;

  return (
    <Pressable
      accessibilityLabel="Show citation sources"
      onPress={() => setOpen(!open)}
    >
      <Badge className={cn('ml-1 rounded-full', className)} variant="secondary">
        {children ??
          (hostname ? (
            <Text className="text-xs text-zinc-900">
              {hostname}
              {sources.length > 1 ? ` +${sources.length - 1}` : ''}
            </Text>
          ) : (
            <Text className="text-xs text-zinc-900">unknown</Text>
          ))}
      </Badge>
    </Pressable>
  );
};

export type InlineCitationCardBodyProps = {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCardBody = ({
  className,
  children,
}: InlineCitationCardBodyProps) => {
  const { open, setOpen } = useInlineCitationCard();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => setOpen(false)}
    >
      <View className="flex-1 items-center justify-center bg-black/30 p-4">
        <Pressable
          accessibilityLabel="Close citation sources"
          className="absolute inset-0"
          onPress={() => setOpen(false)}
        />
        <View
          className={cn('w-80 overflow-hidden rounded-lg border border-zinc-200 bg-white', className)}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
};

type CarouselContextValue = {
  current: number;
  count: number;
  setCount: (count: number) => void;
  next: () => void;
  prev: () => void;
};

const CarouselApiContext = createContext<CarouselContextValue | null>(null);

const useCarouselApi = () => {
  const context = useContext(CarouselApiContext);
  if (!context) {
    throw new Error('Inline citation carousel components must be used within InlineCitationCarousel');
  }
  return context;
};

export type InlineCitationCarouselProps = {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCarousel = ({
  className,
  children,
}: InlineCitationCarouselProps) => {
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  const next = useCallback(() => {
    setCurrent((value) => (count > 0 ? (value + 1) % count : 0));
  }, [count]);

  const prev = useCallback(() => {
    setCurrent((value) => (count > 0 ? (value - 1 + count) % count : 0));
  }, [count]);

  return (
    <CarouselApiContext.Provider value={{ count, current, next, prev, setCount }}>
      <View className={cn('w-full', className)}>{children}</View>
    </CarouselApiContext.Provider>
  );
};

export type InlineCitationCarouselContentProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCarouselContent = ({
  className,
  children,
  ...props
}: InlineCitationCarouselContentProps) => {
  const { current, setCount } = useCarouselApi();

  useEffect(() => {
    setCount(Children.count(children));
  }, [children, setCount]);

  const items = Children.toArray(children);
  const active = items.length > 0 ? items[Math.min(current, items.length - 1)] : null;

  return (
    <View className={cn('w-full', className)} {...props}>
      {active}
    </View>
  );
};

export type InlineCitationCarouselItemProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCarouselItem = ({
  className,
  ...props
}: InlineCitationCarouselItemProps) => (
  <View className={cn('w-full gap-2 p-4 pl-8', className)} {...props} />
);

export type InlineCitationCarouselHeaderProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCarouselHeader = ({
  className,
  ...props
}: InlineCitationCarouselHeaderProps) => (
  <View
    className={cn('flex-row items-center justify-between gap-2 rounded-t-md bg-zinc-100 p-2', className)}
    {...props}
  />
);

export type InlineCitationCarouselIndexProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationCarouselIndex = ({
  children,
  className,
  ...props
}: InlineCitationCarouselIndexProps) => {
  const { count, current } = useCarouselApi();

  return (
    <View className={cn('flex-1 flex-row items-center justify-end px-3 py-1', className)} {...props}>
      {children ?? (
        <Text className="text-xs text-zinc-500">
          {current + 1}/{count}
        </Text>
      )}
    </View>
  );
};

export type InlineCitationCarouselPrevProps = {
  className?: string;
};

export const InlineCitationCarouselPrev = ({ className }: InlineCitationCarouselPrevProps) => {
  const { prev } = useCarouselApi();

  return (
    <Pressable
      accessibilityLabel="Previous"
      className={cn('shrink-0', className)}
      onPress={prev}
    >
      <ArrowLeftIcon size={16} color="#71717a" />
    </Pressable>
  );
};

export type InlineCitationCarouselNextProps = {
  className?: string;
};

export const InlineCitationCarouselNext = ({ className }: InlineCitationCarouselNextProps) => {
  const { next } = useCarouselApi();

  return (
    <Pressable accessibilityLabel="Next" className={cn('shrink-0', className)} onPress={next}>
      <ArrowRightIcon size={16} color="#71717a" />
    </Pressable>
  );
};

export type InlineCitationSourceProps = ViewProps & {
  title?: string;
  url?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
};

export const InlineCitationSource = ({
  title,
  url,
  description,
  className,
  children,
  ...props
}: InlineCitationSourceProps) => (
  <View className={cn('gap-1', className)} {...props}>
    {title ? (
      <Text className="text-sm font-medium leading-tight text-zinc-900" numberOfLines={1}>
        {title}
      </Text>
    ) : null}
    {url ? (
      <Text
        className="text-xs text-zinc-500"
        numberOfLines={1}
        onPress={() => Linking.openURL(url)}
      >
        {url}
      </Text>
    ) : null}
    {description ? (
      <Text className="text-sm leading-relaxed text-zinc-500" numberOfLines={3}>
        {description}
      </Text>
    ) : null}
    {children}
  </View>
);

export type InlineCitationQuoteProps = ViewProps & {
  children?: ReactNode;
  className?: string;
};

export const InlineCitationQuote = ({ children, className, ...props }: InlineCitationQuoteProps) => (
  <View
    className={cn('border-l-2 border-zinc-200 pl-3', className)}
    {...props}
  >
    <Text className="text-sm italic text-zinc-500">{children}</Text>
  </View>
);
