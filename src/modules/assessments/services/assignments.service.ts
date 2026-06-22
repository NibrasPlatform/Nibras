import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import {
  AssignmentSubmissionStatus,
  AssignmentType,
} from '@modules/courses/enums/course.enums';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import { ActivityEventService } from '@modules/gamification/services/activity-event.service';
import {
  CreateAssignmentDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from '../dto/assessments.dto';
import { Assignment, AssignmentDocument } from '../schemas/assignment.schema';
import {
  AssignmentSubmission,
  AssignmentSubmissionDocument,
} from '../schemas/assignment-submission.schema';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<Assignment>,
    @InjectModel(AssignmentSubmission.name)
    private readonly submissionModel: Model<AssignmentSubmission>,
    private readonly coursesService: CoursesService,
    private readonly access: CourseAccessService,
    private readonly activityEvent: ActivityEventService,
  ) {}

  async getAssignmentOrThrow(
    assignmentId: string,
  ): Promise<AssignmentDocument> {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }
    const row = await this.assignmentModel.findById(assignmentId).exec();
    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }
    return row;
  }

  private presentAssignment(
    row: AssignmentDocument,
    submission?: AssignmentSubmissionDocument | null,
    includeDetail = false,
  ) {
    const base: Record<string, unknown> = {
      id: row._id.toString(),
      courseId: row.courseId.toString(),
      title: row.title,
      type: row.type,
      description: row.description || undefined,
      dueAt: row.dueAt?.toISOString() ?? null,
      pointsPossible: row.pointsPossible,
      sortOrder: row.sortOrder,
      published: row.published,
      status: this.computeDisplayStatus(submission ?? null, row.dueAt),
      score: submission?.score ?? undefined,
    };
    if (includeDetail) {
      base.content = row.content;
      base.configJson = row.configJson;
      base.resourceLimits = row.resourceLimits;
      base.testSuite = row.testSuite;
      base.feedback = submission?.textFeedback;
    }
    return base;
  }

  private computeDisplayStatus(
    submission: AssignmentSubmissionDocument | null,
    dueAt?: Date,
  ): string {
    const now = new Date();
    if (!submission || submission.status === AssignmentSubmissionStatus.Draft) {
      if (dueAt && dueAt < now) return 'late';
      return 'not_started';
    }
    if (submission.status === AssignmentSubmissionStatus.Graded)
      return 'graded';
    if (submission.status === AssignmentSubmissionStatus.Submitted) {
      if (dueAt && submission.submittedAt && submission.submittedAt > dueAt) {
        return 'late';
      }
      return 'submitted';
    }
    if (dueAt && dueAt < now) return 'late';
    return 'in_progress';
  }

  async listForCourse(user: AuthenticatedUser, courseId: string) {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }
    const isManager = await this.access.canManageCourseForRequest(
      user,
      courseId,
    );
    const rows = await this.assignmentModel
      .find({
        courseId: new Types.ObjectId(courseId),
        ...(isManager ? {} : { published: true }),
      })
      .sort({ sortOrder: 1, createdAt: 1 })
      .exec();

    const subs = await this.submissionModel
      .find({
        userId: new Types.ObjectId(user.id),
        assignmentId: { $in: rows.map((r) => r._id) },
      })
      .exec();
    const subByAssignment = new Map(
      subs.map((s) => [s.assignmentId.toString(), s]),
    );

    return rows.map((r) =>
      this.presentAssignment(r, subByAssignment.get(r._id.toString()) ?? null),
    );
  }

  async create(
    user: AuthenticatedUser,
    courseId: string,
    dto: CreateAssignmentDto,
  ) {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const max = await this.assignmentModel
        .findOne({ courseId: new Types.ObjectId(courseId) })
        .sort({ sortOrder: -1 })
        .select('sortOrder')
        .exec();
      sortOrder = (max?.sortOrder ?? -1) + 1;
    }

    const row = await this.assignmentModel.create({
      courseId: new Types.ObjectId(courseId),
      title: dto.title,
      description: dto.description ?? '',
      content: dto.content ?? '',
      type: dto.type ?? AssignmentType.Code,
      configJson: dto.configJson ?? {},
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      pointsPossible: dto.pointsPossible ?? 100,
      resourceLimits: dto.resourceLimits ?? {},
      published: dto.published ?? true,
      sortOrder,
    });

    return this.presentAssignment(row, null);
  }

  async update(
    user: AuthenticatedUser,
    courseId: string,
    assignmentId: string,
    dto: UpdateAssignmentDto,
  ) {
    const row = await this.getAssignmentOrThrow(assignmentId);
    if (row.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    if (dto.title !== undefined) row.title = dto.title;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.content !== undefined) row.content = dto.content;
    if (dto.type !== undefined) row.type = dto.type;
    if (dto.configJson !== undefined) row.configJson = dto.configJson;
    if (dto.dueAt !== undefined) {
      row.dueAt = dto.dueAt === null ? undefined : new Date(dto.dueAt);
    }
    if (dto.pointsPossible !== undefined)
      row.pointsPossible = dto.pointsPossible;
    if (dto.resourceLimits !== undefined) {
      row.resourceLimits = { ...row.resourceLimits, ...dto.resourceLimits };
    }
    if (dto.published !== undefined) row.published = dto.published;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    await row.save();

    return this.presentAssignment(row, null);
  }

  async delete(
    user: AuthenticatedUser,
    courseId: string,
    assignmentId: string,
  ) {
    const row = await this.getAssignmentOrThrow(assignmentId);
    if (row.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }
    await this.assignmentModel.deleteOne({ _id: row._id }).exec();
    return { ok: true };
  }

  async getDetail(user: AuthenticatedUser, assignmentId: string) {
    const row = await this.getAssignmentOrThrow(assignmentId);
    const courseId = row.courseId.toString();
    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }
    const isManager = await this.access.canManageCourseForRequest(
      user,
      courseId,
    );
    if (!row.published && !isManager) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }

    const submission = await this.submissionModel
      .findOne({
        assignmentId: row._id,
        userId: new Types.ObjectId(user.id),
      })
      .exec();

    return this.presentAssignment(row, submission, true);
  }

  async listSubmissions(user: AuthenticatedUser, assignmentId: string) {
    const row = await this.getAssignmentOrThrow(assignmentId);
    if (
      !(await this.access.canManageCourseForRequest(
        user,
        row.courseId.toString(),
      ))
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const subs = await this.submissionModel
      .find({
        assignmentId: row._id,
        status: {
          $in: [
            AssignmentSubmissionStatus.Submitted,
            AssignmentSubmissionStatus.Graded,
          ],
        },
      })
      .sort({ submittedAt: -1 })
      .exec();

    return {
      items: subs.map((s) => ({
        id: s._id.toString(),
        userId: s.userId.toString(),
        submittedAt: s.submittedAt?.toISOString() ?? null,
        status: s.status,
        score: s.score,
        verdict: s.verdict,
        contentPreview: (s.code ?? s.content).slice(0, 200),
      })),
    };
  }

  async submit(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: SubmitAssignmentDto,
  ) {
    const row = await this.getAssignmentOrThrow(assignmentId);
    if (!row.published) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Assignment not found',
      });
    }
    const courseId = row.courseId.toString();
    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    if (row.type === AssignmentType.Code && !dto.code?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'Code submission required for code assignments',
      });
    }

    const now = new Date();
    const record = await this.submissionModel
      .findOneAndUpdate(
        {
          assignmentId: row._id,
          userId: new Types.ObjectId(user.id),
        },
        {
          $set: {
            content: dto.content?.trim() ?? '',
            code: dto.code,
            language: dto.language ?? 'javascript',
            fileUrl: dto.fileUrl,
            answersJson: dto.answers ?? {},
            status: AssignmentSubmissionStatus.Submitted,
            submittedAt: now,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    try {
      await this.activityEvent.recordAssignmentSubmitted({
        userId: user.id,
        submissionId: record._id.toString(),
        assignmentId,
        courseId,
      });
    } catch (err) {
      this.logger.error(
        `Gamification award failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      id: record._id.toString(),
      assignmentId,
      status: record.status,
      submittedAt: record.submittedAt?.toISOString(),
    };
  }

  async getSubmissionOrThrow(
    submissionId: string,
  ): Promise<AssignmentSubmissionDocument> {
    if (!Types.ObjectId.isValid(submissionId)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Submission not found',
      });
    }
    const sub = await this.submissionModel.findById(submissionId).exec();
    if (!sub) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Submission not found',
      });
    }
    return sub;
  }
}
