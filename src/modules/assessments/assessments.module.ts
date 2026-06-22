import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@modules/auth/auth.module';
import { CoursesModule } from '@modules/courses/courses.module';
import { GamificationModule } from '@modules/gamification/gamification.module';
import {
  Assignment,
  AssignmentSchema,
  AssignmentSubmission,
  AssignmentSubmissionSchema,
  PlagiarismReport,
  PlagiarismReportSchema,
  Rubric,
  RubricSchema,
  TestCase,
  TestCaseSchema,
} from './schemas';
import {
  AssignmentsController,
  CourseAssignmentsController,
} from './controllers/assignments.controller';
import { TestCasesController } from './controllers/test-cases.controller';
import { SubmissionsController } from './controllers/submissions.controller';
import { AssignmentsService } from './services/assignments.service';
import { TestCasesService } from './services/test-cases.service';
import { EvaluationService } from './services/evaluation.service';
import { DockerExecutorService } from './execution/docker-executor.service';
import { BenchmarkService } from './services/benchmark.service';
import { StyleAnalysisService } from './services/style-analysis.service';
import { MossService } from './services/moss.service';
import { FeedbackService } from './services/feedback.service';
import { RubricsService } from './services/rubrics.service';

@Module({
  imports: [
    AuthModule,
    CoursesModule,
    GamificationModule,
    MongooseModule.forFeature([
      { name: Assignment.name, schema: AssignmentSchema },
      { name: TestCase.name, schema: TestCaseSchema },
      { name: Rubric.name, schema: RubricSchema },
      { name: AssignmentSubmission.name, schema: AssignmentSubmissionSchema },
      { name: PlagiarismReport.name, schema: PlagiarismReportSchema },
    ]),
  ],
  controllers: [
    CourseAssignmentsController,
    AssignmentsController,
    TestCasesController,
    SubmissionsController,
  ],
  providers: [
    AssignmentsService,
    TestCasesService,
    EvaluationService,
    DockerExecutorService,
    BenchmarkService,
    StyleAnalysisService,
    MossService,
    FeedbackService,
    RubricsService,
  ],
  exports: [AssignmentsService, DockerExecutorService, MongooseModule],
})
export class AssessmentsModule {}
