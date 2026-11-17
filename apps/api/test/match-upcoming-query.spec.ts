import { Attendance, MatchStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AvatarService } from '../src/avatars/avatar.service';
import { MatchesService } from '../src/matches/matches.service';
import type { ProposalReceiptService } from '../src/matches/proposal-receipt.service';
import type { TeamGenerationDataService } from '../src/matches/team-generation-data.service';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('upcoming Match query', () => {
  it('uses lifecycle status without a scheduled-time cutoff', async () => {
    const overdue = {
      id: '00000000-0000-4000-8000-000000000001',
      startsAt: new Date('2000-09-01T18:30:00.000Z'),
      location: 'Pitch A',
      status: MatchStatus.OPEN_FOR_REGISTRATION,
      stateVersion: 2,
      sport: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Football',
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 3,
      },
      participants: [{ attendance: Attendance.GOING }],
    };
    const findMany = vi
      .fn<(query: unknown) => Promise<(typeof overdue)[]>>()
      .mockResolvedValue([overdue]);
    const service = new MatchesService(
      { match: { findMany } } as unknown as PrismaService,
      {} as ProposalReceiptService,
      {} as TeamGenerationDataService,
      {} as AvatarService,
    );

    const matches = await service.upcoming(
      '00000000-0000-4000-8000-000000000003',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: [MatchStatus.OPEN_FOR_REGISTRATION, MatchStatus.IN_PROGRESS],
          },
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty('where.startsAt');
    expect(matches).toEqual([
      expect.objectContaining({
        id: overdue.id,
        myAttendance: Attendance.GOING,
        startsAt: '2000-09-01T18:30:00.000Z',
        status: MatchStatus.OPEN_FOR_REGISTRATION,
      }),
    ]);
  });
});
