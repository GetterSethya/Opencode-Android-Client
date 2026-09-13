import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { OpencodeFilePartInput } from './opencode';

export type PendingAttachment = {
  id: string;
  kind: 'image' | 'file';
  uri: string;
  name: string;
  mime: string;
  size?: number;
};

function createId() {
  return `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function pickImages(): Promise<PendingAttachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    quality: 0.8,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }

  return result.assets.map((asset) => ({
    id: createId(),
    kind: 'image' as const,
    uri: asset.uri,
    name: asset.fileName ?? `image-${Date.now()}.jpg`,
    mime: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize,
  }));
}

export async function pickDocuments(): Promise<PendingAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }

  return result.assets.map((asset) => ({
    id: createId(),
    kind: 'file' as const,
    uri: asset.uri,
    name: asset.name,
    mime: asset.mimeType ?? 'application/octet-stream',
    size: asset.size,
  }));
}

export async function toFilePart(attachment: PendingAttachment): Promise<OpencodeFilePartInput> {
  const base64 = await new File(attachment.uri).base64();

  return {
    type: 'file',
    mime: attachment.mime,
    filename: attachment.name,
    url: `data:${attachment.mime};base64,${base64}`,
  };
}
