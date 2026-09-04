import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from 'expo-crypto';

export interface CompletionCrypto {
  createIdempotencyKey(): string;
  hashCanonicalPayload(payload: string): Promise<string>;
}

export const expoCompletionCrypto: CompletionCrypto = {
  createIdempotencyKey: () => randomUUID(),
  hashCanonicalPayload: (payload) =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, payload),
};
