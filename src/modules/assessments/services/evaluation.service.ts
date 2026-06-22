import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import {
  AssignmentSubmissionStatus,
  TestCaseResultStatus,
} from '@modules/courses/enums/course.enums';
import { SubmissionStatus } from '@modules/competitions/enums/competition.enums';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { ActivityEventService } from '@modules/gamification/services/activity-event.service';
import { DockerExecutorService } from '../execution/docker-executor.service';
import {
  AssignmentSubmission,
  TestCaseResult,
} from '../schemas/assignment-submission.schema';
import { AssignmentsService } from './assignments.service';
import { TestCasesService } from './test-cases.service';
import { BenchmarkService } from './benchmark.service';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    @InjectModel(AssignmentSubmission.name)
    private readonly submissionModel: Model<AssignmentSubmission>,
    private readonly assignmentsService: AssignmentsService,
    private readonly testCasesService: TestCasesService,
    private readonly executor: DockerExecutorService,
    private readonly benchmark: BenchmarkService,
    private readonly access: CourseAccessService,
    private readonly activityEvent: ActivityEventService,
  ) {}

  async evaluate(
    user: AuthenticatedUser,
    assignmentId: string,
    submissionId?: string,
  ) {
    const assignment =
      await this.assignmentsService.getAssignmentOrThrow(assignmentId);
    const courseId = assignment.courseId.toString();
    const isManager = await this.access.canManageCourseForRequest(
      user,
      courseId,
    );

    const submission = submissionId
      ? await this.assignmentsService.getSubmissionOrThrow(submissionId)
      : await this.submissionModel
          .findOne({
            assignmentId: assignment._id,
            userId: new Types.ObjectId(user.id),
          })
          .exec();

    if (!submission) {
      throw new BadRequestException({
        code: 'NO_SUBMISSION',
        message: 'Submit before evaluating',
      });
    }

    if (submission.userId.toString() !== user.id && !isManager) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    if (!submission.code?.trim()) {
      throw new BadRequestException({
        code: 'NO_CODE',
        message: 'Code required for evaluation',
      });
    }

    const includeHidden =
      isManager ||
      submission.status === AssignmentSubmissionStatus.Submitted ||
      submission.status === AssignmentSubmissionStatus.Graded;

    const testCases = await this.testCasesService.listForEvaluation(
      assignment._id,
      includeHidden,
    );

    if (!testCases.length) {
      throw new BadRequestException({
        code: 'NO_TEST_CASES',
        message: 'Assignment has no test cases',
      });
    }

    const results: TestCaseResult[] = [];
    let totalWeight = 0;
    let earnedWeight = 0;
    let maxTime = 0;
    let maxMem = 0;
    let overallVerdict = SubmissionStatus.Accepted;

    for (const tc of testCases) {
      const exec = await this.executor.runTestCase({
        language: submission.language ?? 'javascript',
        code: submission.code,
        stdin: tc.input,
        expectedOutput: tc.expectedOutput,
        limits: assignment.resourceLimits,
        timeLimitMs: tc.timeLimit,
        memoryLimitMb: tc.memoryLimit,
      });

      maxTime = Math.max(maxTime, exec.timeMs);
      maxMem = Math.max(maxMem, exec.memoryKb);
      totalWeight += tc.weight;
      if (exec.testStatus === TestCaseResultStatus.Pass) {
        earnedWeight += tc.weight;
      }
      if (exec.verdict !== SubmissionStatus.Accepted) {
        overallVerdict = exec.verdict;
      }

      results.push({
        testCaseId: tc._id,
        status: exec.testStatus,
        actualOutput: exec.stdout,
        timeMs: exec.timeMs,
        memoryKb: exec.memoryKb,
        message: exec.stderr || undefined,
      });
    }

    const score =
      totalWeight > 0
        ? Math.round((earnedWeight / totalWeight) * assignment.pointsPossible)
        : 0;

    submission.testResults = results;
    submission.verdict = overallVerdict;
    submission.runtime = maxTime;
    submission.memory = maxMem;
    submission.score = score;
    if (overallVerdict === SubmissionStatus.Accepted) {
      submission.status = AssignmentSubmissionStatus.Graded;
    }
    await submission.save();

    if (submission.status === AssignmentSubmissionStatus.Graded) {
      try {
        await this.activityEvent.recordAssignmentApproved({
          userId: user.id,
          submissionId: submission._id.toString(),
          assignmentId,
          courseId,
          grade: score,
        });
      } catch (err) {
        this.logger.error(
          `Gamification award failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const benchmarkInsight = await this.benchmark.compareToClassMedian(
      assignmentId,
      maxTime,
      maxMem,
    );

    return {
      submissionId: submission._id.toString(),
      verdict: overallVerdict,
      score,
      testResults: results.map((r) => ({
        testCaseId: r.testCaseId.toString(),
        status: r.status,
        actualOutput: r.actualOutput,
        timeMs: r.timeMs,
        memoryKb: r.memoryKb,
        message: r.message,
      })),
      benchmark: benchmarkInsight,
      executorMode: this.executor.isEnabled() ? 'docker' : 'fallback',
    };
  }
}
