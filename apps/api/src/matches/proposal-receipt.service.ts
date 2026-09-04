import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { canonicalizePartition } from '@teamizer/algorithm';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { ApiError } from '../common/errors/api-error';
import type { AppEnvironment } from '../environment';

export type ProposalReceiptPayload = {
  matchId: string;
  matchStateVersion: number;
  generatedTeamAPlayerIds: string[];
  generatedTeamBPlayerIds: string[];
  algorithmVersion: string;
  configurationVersion: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProposalReceiptService {
  private readonly secret: string;

  constructor(
    @Inject(ConfigService)
    configService: ConfigService<AppEnvironment, true>,
  ) {
    this.secret = configService.get('PROPOSAL_RECEIPT_SECRET', { infer: true });
  }

  sign(payload: ProposalReceiptPayload): string {
    const canonical = canonicalizePartition(
      payload.generatedTeamAPlayerIds,
      payload.generatedTeamBPlayerIds,
    );
    const encodedPayload = Buffer.from(
      JSON.stringify({
        matchId: payload.matchId,
        matchStateVersion: payload.matchStateVersion,
        generatedTeamAPlayerIds: canonical.teamA,
        generatedTeamBPlayerIds: canonical.teamB,
        algorithmVersion: payload.algorithmVersion,
        configurationVersion: payload.configurationVersion,
      } satisfies ProposalReceiptPayload),
      'utf8',
    ).toString('base64url');

    return `${encodedPayload}.${this.signature(encodedPayload).toString('base64url')}`;
  }

  verify(receipt: string): ProposalReceiptPayload {
    try {
      const parts = receipt.split('.');

      if (parts.length !== 2) {
        throw new Error('Receipt must have two parts.');
      }

      const encodedPayload = parts[0];
      const encodedSignature = parts[1];

      if (!encodedPayload || !encodedSignature) {
        throw new Error('Receipt part is empty.');
      }

      const actualSignature = Buffer.from(encodedSignature, 'base64url');
      const expectedSignature = this.signature(encodedPayload);

      if (
        actualSignature.length !== expectedSignature.length ||
        !timingSafeEqual(actualSignature, expectedSignature)
      ) {
        throw new Error('Receipt signature is invalid.');
      }

      const parsed: unknown = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );

      if (!this.isPayload(parsed)) {
        throw new Error('Receipt payload is invalid.');
      }

      const canonical = canonicalizePartition(
        parsed.generatedTeamAPlayerIds,
        parsed.generatedTeamBPlayerIds,
      );

      if (
        JSON.stringify(canonical.teamA) !==
          JSON.stringify(parsed.generatedTeamAPlayerIds) ||
        JSON.stringify(canonical.teamB) !==
          JSON.stringify(parsed.generatedTeamBPlayerIds)
      ) {
        throw new Error('Receipt memberships are not canonical.');
      }

      return parsed;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        409,
        'PROPOSAL_RECEIPT_INVALID',
        'The team proposal receipt is invalid.',
      );
    }
  }

  private signature(encodedPayload: string): Buffer {
    return createHmac('sha256', this.secret).update(encodedPayload).digest();
  }

  private isPayload(value: unknown): value is ProposalReceiptPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.matchId === 'string' &&
      uuidPattern.test(candidate.matchId) &&
      typeof candidate.matchStateVersion === 'number' &&
      Number.isInteger(candidate.matchStateVersion) &&
      candidate.matchStateVersion >= 0 &&
      this.isPlayerIdArray(candidate.generatedTeamAPlayerIds) &&
      this.isPlayerIdArray(candidate.generatedTeamBPlayerIds) &&
      typeof candidate.algorithmVersion === 'string' &&
      candidate.algorithmVersion.length > 0 &&
      typeof candidate.configurationVersion === 'string' &&
      candidate.configurationVersion.length > 0
    );
  }

  private isPlayerIdArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      new Set(value).size === value.length &&
      value.every(
        (playerId) =>
          typeof playerId === 'string' && uuidPattern.test(playerId),
      )
    );
  }
}
