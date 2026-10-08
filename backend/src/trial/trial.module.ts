import { Module } from '@nestjs/common';
import { TrialController } from './trial.controller.js';
import { TrialService } from './trial.service.js';

@Module({
  controllers: [TrialController],
  providers: [TrialService],
  exports: [TrialService],
})
export class TrialModule {}
