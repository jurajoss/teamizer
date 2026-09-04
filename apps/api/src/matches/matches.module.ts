import { Module } from '@nestjs/common';

import { SchedulingModule } from '../scheduling/scheduling.module';
import { MatchAdministrationController } from './match-administration.controller';
import { MatchAdministrationService } from './match-administration.service';

import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { ProposalReceiptService } from './proposal-receipt.service';
import { TeamGenerationDataService } from './team-generation-data.service';

@Module({
  imports: [SchedulingModule],
  controllers: [MatchesController, MatchAdministrationController],
  providers: [
    MatchesService,
    MatchAdministrationService,
    ProposalReceiptService,
    TeamGenerationDataService,
  ],
})
export class MatchesModule {}
