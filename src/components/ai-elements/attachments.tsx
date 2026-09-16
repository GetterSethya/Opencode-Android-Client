import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { Image, Text, View, type ImageStyle, type StyleProp, type ViewProps } from 'react-native';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type AttachmentFileData = {
  type: 'file';
  id: string;
  url?: string;
  mediaType?: string;
  filename?: string;
};

export type AttachmentSourceDocumentData = {
  type: 'source-document';
  id: string;
  url?: string;
  mediaType?: string;
  filename?: string;
  title?: string;
};

export type AttachmentData = AttachmentFileData | AttachmentSourceDocumentData;

export type AttachmentMediaCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'source'
  | 'unknown';

export type AttachmentVariant = 'grid' | 'inline' | 'list';

const mediaCategoryIcons: Record<AttachmentMediaCategory, typeof ImageIcon> = {
  audio: Music2Icon,
  document: FileTextIcon,
  image: ImageIcon,
  source: GlobeIcon,
  unknown: PaperclipIcon,
  video: VideoIcon,
};

// ============================================================================
// Utility Functions
// ============================================================================

export function getMediaCategory(data: AttachmentData): AttachmentMediaCategory {
  if (data.type === 'source-document') {
    return 'source';
  }

  const mediaType = data.mediaType ?? '';

  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('video/')) {
    return 'video';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  if (mediaType.startsWith('application/') || mediaType.startsWith('text/')) {
    return 'document';
  }

  return 'unknown';
}

export function getAttachmentLabel(data: AttachmentData): string {
  if (data.type === 'source-document') {
    return data.title || data.filename || 'Source';
  }

  const category = getMediaCategory(data);
  return data.filename || (category === 'image' ? 'Image' : 'Attachment');
}

// ============================================================================
// Contexts
// ============================================================================

type AttachmentsContextValue = {
  variant: AttachmentVariant;
};

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

type AttachmentContextValue = {
  data: AttachmentData;
  mediaCategory: AttachmentMediaCategory;
  onRemove?: () => void;
  variant: AttachmentVariant;
};

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

export function useAttachmentsContext(): AttachmentsContextValue {
  return useContext(AttachmentsContext) ?? { variant: 'grid' };
}

export function useAttachmentContext(): AttachmentContextValue {
  const context = useContext(AttachmentContext);
  if (!context) {
    throw new Error('Attachment components must be used within <Attachment>');
  }
  return context;
}

// ============================================================================
// Attachments - Container
// ============================================================================

export type AttachmentsProps = ViewProps & {
  variant?: AttachmentVariant;
  children?: ReactNode;
};

export function Attachments({
  variant = 'grid',
  className,
  children,
  ...props
}: AttachmentsProps) {
  const contextValue = useMemo<AttachmentsContextValue>(() => ({ variant }), [variant]);

  return (
    <AttachmentsContext.Provider value={contextValue}>
      <View
        className={cn(
          'flex-row items-start',
          variant === 'list' ? 'flex-col gap-2' : 'flex-row flex-wrap gap-2',
          variant === 'grid' && 'ml-auto w-fit',
          className,
        )}
        {...props}
      >
        {children}
      </View>
    </AttachmentsContext.Provider>
  );
}

// ============================================================================
// Attachment - Item
// ============================================================================

export type AttachmentProps = ViewProps & {
  data: AttachmentData;
  onRemove?: () => void;
  children?: ReactNode;
};

export function Attachment({ data, onRemove, className, children, ...props }: AttachmentProps) {
  const { variant } = useAttachmentsContext();
  const mediaCategory = getMediaCategory(data);

  const contextValue = useMemo<AttachmentContextValue>(
    () => ({ data, mediaCategory, onRemove, variant }),
    [data, mediaCategory, onRemove, variant],
  );

  return (
    <AttachmentContext.Provider value={contextValue}>
      <View
        className={cn(
          'relative',
          variant === 'grid' && 'h-24 w-24 overflow-hidden rounded-lg',
          variant === 'inline' && 'h-8 flex-row items-center gap-1.5 rounded-md border border-border px-1.5',
          variant === 'list' && 'w-full flex-row items-center gap-3 rounded-lg border border-border p-3',
          className,
        )}
        {...props}
      >
        {children}
      </View>
    </AttachmentContext.Provider>
  );
}

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

export type AttachmentPreviewProps = ViewProps & {
  fallbackIcon?: ReactNode;
};

export function AttachmentPreview({ fallbackIcon, className, ...props }: AttachmentPreviewProps) {
  const { data, mediaCategory, variant } = useAttachmentContext();

  const iconSize = variant === 'inline' ? 12 : 16;

  const renderIcon = (Icon: typeof ImageIcon) => <Icon size={iconSize} color="#71717a" />;

  const renderContent = () => {
    if (mediaCategory === 'image' && data.type === 'file' && data.url) {
      const imageStyle: StyleProp<ImageStyle> =
        variant === 'grid'
          ? { width: '100%', height: '100%' }
          : {
              width: variant === 'inline' ? 20 : 48,
              height: variant === 'inline' ? 20 : 48,
              borderRadius: variant === 'inline' ? 4 : 6,
            };

      return (
        <Image
          accessibilityLabel={data.filename ?? 'Image'}
          resizeMode="cover"
          source={{ uri: data.url }}
          style={imageStyle}
        />
      );
    }

    const Icon = mediaCategoryIcons[mediaCategory];
    return fallbackIcon ?? renderIcon(Icon);
  };

  return (
    <View
      className={cn(
        'shrink-0 items-center justify-center overflow-hidden',
        variant === 'grid' && 'h-full w-full bg-surface-secondary',
        variant === 'inline' && 'h-5 w-5 rounded bg-surface',
        variant === 'list' && 'h-12 w-12 rounded bg-surface-secondary',
        className,
      )}
      {...props}
    >
      {renderContent()}
    </View>
  );
}

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

export type AttachmentInfoProps = ViewProps & {
  showMediaType?: boolean;
};

export function AttachmentInfo({ showMediaType = false, className, ...props }: AttachmentInfoProps) {
  const { data, variant } = useAttachmentContext();
  const label = getAttachmentLabel(data);

  if (variant === 'grid') {
    return null;
  }

  return (
    <View className={cn('min-w-0 flex-1', className)} {...props}>
      <Text className="text-sm text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {showMediaType && data.mediaType ? (
        <Text className="text-xs text-muted" numberOfLines={1}>
          {data.mediaType}
        </Text>
      ) : null}
    </View>
  );
}

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

export type AttachmentRemoveProps = ButtonProps & {
  label?: string;
};

export function AttachmentRemove({
  label = 'Remove',
  className,
  children,
  ...props
}: AttachmentRemoveProps) {
  const { onRemove, variant } = useAttachmentContext();

  const handlePress = useCallback(() => {
    onRemove?.();
  }, [onRemove]);

  if (!onRemove) {
    return null;
  }

  return (
    <Button
      accessibilityLabel={label}
      className={cn(
        variant === 'grid' && 'absolute right-1 top-1 h-6 w-6 rounded-full bg-surface/80',
        variant === 'inline' && 'h-5 w-5 rounded p-0',
        variant === 'list' && 'h-8 w-8 shrink-0 rounded p-0',
        className,
      )}
      onPress={handlePress}
      size="icon-sm"
      variant="ghost"
      {...props}
    >
      {children ?? <XIcon size={14} color="#71717a" />}
    </Button>
  );
}

// ============================================================================
// AttachmentHoverCard - Hover preview (no-op wrapper on native)
// ============================================================================

export type AttachmentHoverCardProps = {
  openDelay?: number;
  closeDelay?: number;
  children?: ReactNode;
  className?: string;
};

export function AttachmentHoverCard({ className, children }: AttachmentHoverCardProps) {
  return <View className={className}>{children}</View>;
}

export type AttachmentHoverCardTriggerProps = {
  children?: ReactNode;
  className?: string;
};

export function AttachmentHoverCardTrigger({ className, children }: AttachmentHoverCardTriggerProps) {
  return <View className={className}>{children}</View>;
}

export type AttachmentHoverCardContentProps = {
  align?: 'start' | 'center' | 'end';
  children?: ReactNode;
  className?: string;
};

export function AttachmentHoverCardContent({
  className,
  children,
}: AttachmentHoverCardContentProps) {
  return (
    <View className={cn('rounded-md border border-border bg-surface p-2', className)}>
      {children}
    </View>
  );
}

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

export type AttachmentEmptyProps = ViewProps & {
  children?: ReactNode;
};

export function AttachmentEmpty({ className, children, ...props }: AttachmentEmptyProps) {
  return (
    <View
      className={cn('items-center justify-center p-4', className)}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className="text-sm text-muted">{children}</Text>
      ) : (
        (children ?? <Text className="text-sm text-muted">No attachments</Text>)
      )}
    </View>
  );
}
