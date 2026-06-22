import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { User } from '@modules/auth/schemas/user.schema';
import { CourseRole, EnrollmentRequestStatus } from '../enums/course.enums';
import {
  CreateCourseDto,
  UpdateCourseDto,
  AddCourseMemberDto,
} from '../dto/courses.dto';
import { Course, CourseDocument } from '../schemas/course.schema';
import { CourseMembership } from '../schemas/course-membership.schema';
import { CourseEnrollmentRequest } from '../schemas/course-enrollment-request.schema';
import { CourseAccessService } from './course-access.service';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(CourseMembership.name)
    private readonly membershipModel: Model<CourseMembership>,
    @InjectModel(CourseEnrollmentRequest.name)
    private readonly enrollmentModel: Model<CourseEnrollmentRequest>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly access: CourseAccessService,
  ) {}

  private presentCourse(
    course: CourseDocument,
    role?: CourseRole,
  ): Record<string, unknown> {
    return {
      id: course._id.toString(),
      slug: course.slug,
      title: course.title,
      termLabel: course.termLabel,
      courseCode: course.courseCode,
      description: course.description || undefined,
      isPublic: course.isPublic,
      isActive: course.isActive,
      level: course.level,
      sortOrder: course.sortOrder,
      trackId: course.trackId?.toString() ?? null,
      sequentialVideos: course.sequentialVideos,
      thumbnailUrl: course.thumbnailUrl,
      syllabus: course.syllabus,
      role,
    };
  }

  async listMyCourses(user: AuthenticatedUser) {
    const memberships = await this.membershipModel
      .find({ userId: new Types.ObjectId(user.id) })
      .exec();
    if (!memberships.length) return [];

    const courseIds = memberships.map((m) => m.courseId);
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds }, deletedAt: null })
      .exec();
    const roleByCourse = new Map(
      memberships.map((m) => [m.courseId.toString(), m.role]),
    );
    return courses.map((c) =>
      this.presentCourse(c, roleByCourse.get(c._id.toString())),
    );
  }

  async browsePublicCourses(user: AuthenticatedUser) {
    const courses = await this.courseModel
      .find({ isPublic: true, isActive: true, deletedAt: null })
      .sort({ title: 1 })
      .exec();
    const memberships = await this.membershipModel
      .find({
        userId: new Types.ObjectId(user.id),
        courseId: { $in: courses.map((c) => c._id) },
      })
      .exec();
    const enrolled = new Set(memberships.map((m) => m.courseId.toString()));
    return courses.map((c) => ({
      ...this.presentCourse(c),
      enrolled: enrolled.has(c._id.toString()),
    }));
  }

  async createCourse(user: AuthenticatedUser, dto: CreateCourseDto) {
    if (!this.access.hasInstructorPlatformRole(user)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Instructor or admin role required to create courses',
      });
    }

    const existing = await this.courseModel.findOne({ slug: dto.slug }).exec();
    if (existing) {
      throw new ConflictException({
        code: 'SLUG_EXISTS',
        message: 'Course slug already exists',
      });
    }

    const course = await this.courseModel.create({
      slug: dto.slug,
      title: dto.title,
      termLabel: dto.termLabel,
      courseCode: dto.courseCode,
      description: dto.description ?? '',
      isPublic: dto.isPublic ?? false,
      isActive: true,
      deletedAt: null,
    });

    await this.membershipModel.create({
      courseId: course._id,
      userId: new Types.ObjectId(user.id),
      role: CourseRole.Instructor,
      level: 1,
    });

    return this.presentCourse(course, CourseRole.Instructor);
  }

  async getCourseDetail(user: AuthenticatedUser, courseId: string) {
    const course = await this.access.findActiveCourse(courseId);
    if (!course) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Course not found',
      });
    }

    let membership = await this.access.getMembership(user.id, courseId);
    if (!membership && course.isPublic) {
      membership = await this.access.ensurePublicCourseStudentAccess(
        user.id,
        course,
      );
    }

    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Not enrolled in this course',
      });
    }

    return this.presentCourse(course, membership?.role);
  }

  async assertCourseExists(courseId: string): Promise<CourseDocument> {
    const course = await this.access.findActiveCourse(courseId);
    if (!course) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Course not found',
      });
    }
    return course;
  }

  async enroll(user: AuthenticatedUser, courseId: string, message?: string) {
    const course = await this.assertCourseExists(courseId);
    const existing = await this.access.getMembership(user.id, courseId);
    if (existing) {
      return { ok: true, status: 'already_enrolled', role: existing.role };
    }

    if (course.isPublic) {
      const membership = await this.access.ensurePublicCourseStudentAccess(
        user.id,
        course,
      );
      return {
        ok: true,
        status: 'enrolled',
        role: membership?.role ?? CourseRole.Student,
      };
    }

    const request = await this.enrollmentModel
      .findOneAndUpdate(
        {
          courseId: course._id,
          userId: new Types.ObjectId(user.id),
        },
        {
          $set: {
            status: EnrollmentRequestStatus.Pending,
            message: message?.trim(),
          },
          $setOnInsert: {
            courseId: course._id,
            userId: new Types.ObjectId(user.id),
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return {
      ok: true,
      status: 'pending',
      requestId: request._id.toString(),
    };
  }

  async listMembers(user: AuthenticatedUser, courseId: string) {
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Course management access required',
      });
    }

    const memberships = await this.membershipModel
      .find({ courseId: new Types.ObjectId(courseId) })
      .exec();
    const userIds = memberships.map((m) => m.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('username')
      .exec();
    const usernameById = new Map(
      users.map((u) => [u._id.toString(), u.username]),
    );

    return {
      items: memberships.map((m) => ({
        userId: m.userId.toString(),
        username: usernameById.get(m.userId.toString()),
        role: m.role,
        level: m.level,
      })),
    };
  }

  async addMember(
    user: AuthenticatedUser,
    courseId: string,
    dto: AddCourseMemberDto,
  ) {
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Course management access required',
      });
    }
    await this.assertCourseExists(courseId);

    if (!Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException({
        code: 'INVALID_USER_ID',
        message: 'Invalid user id',
      });
    }

    const targetUser = await this.userModel.findById(dto.userId).exec();
    if (!targetUser) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const membership = await this.membershipModel
      .findOneAndUpdate(
        {
          courseId: new Types.ObjectId(courseId),
          userId: new Types.ObjectId(dto.userId),
        },
        {
          $set: { role: dto.role, level: dto.level ?? 1 },
          $setOnInsert: {
            courseId: new Types.ObjectId(courseId),
            userId: new Types.ObjectId(dto.userId),
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return {
      userId: membership.userId.toString(),
      role: membership.role,
      level: membership.level,
    };
  }

  async listPendingEnrollments(user: AuthenticatedUser) {
    const requests = await this.enrollmentModel
      .find({
        userId: new Types.ObjectId(user.id),
        status: EnrollmentRequestStatus.Pending,
      })
      .populate('courseId', 'slug title termLabel courseCode isPublic')
      .lean()
      .exec();

    return requests.map((r) => {
      const course = r.courseId as unknown as {
        _id: Types.ObjectId;
        slug: string;
        title: string;
        termLabel: string;
        courseCode: string;
        isPublic: boolean;
      };
      return {
        requestId: r._id.toString(),
        courseId: course._id.toString(),
        slug: course.slug,
        title: course.title,
        termLabel: course.termLabel,
        courseCode: course.courseCode,
        message: r.message ?? null,
        requestedAt: (r as unknown as { createdAt: string }).createdAt,
      };
    });
  }

  async listEnrollmentRequests(
    manager: AuthenticatedUser,
    courseId: string,
    status?: EnrollmentRequestStatus,
  ) {
    if (!(await this.access.canManageCourseForRequest(manager, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Course management access required',
      });
    }

    const filter: Record<string, unknown> = {
      courseId: new Types.ObjectId(courseId),
    };
    if (status) filter.status = status;

    const requests = await this.enrollmentModel
      .find(filter)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return requests.reduce<Array<Record<string, unknown>>>((acc, r) => {
      if (!r.userId) return acc;
      const user = r.userId as unknown as {
        _id: Types.ObjectId;
        username?: string;
        email?: string;
      };
      acc.push({
        id: r._id.toString(),
        userId: user._id.toString(),
        username: user.username ?? null,
        email: user.email ?? null,
        status: r.status,
        message: r.message ?? null,
        requestedAt: (r as unknown as { createdAt: string }).createdAt,
        reviewedBy: r.reviewedBy?.toString() ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      });
      return acc;
    }, []);
  }

  async updateCourse(
    user: AuthenticatedUser,
    courseId: string,
    dto: UpdateCourseDto,
  ) {
    const course = await this.access.findActiveCourse(courseId);
    if (!course) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Course not found',
      });
    }

    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Course management access required',
      });
    }

    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.isPublic !== undefined) updates.isPublic = dto.isPublic;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    if (dto.sequentialVideos !== undefined)
      updates.sequentialVideos = dto.sequentialVideos;
    if (dto.thumbnailUrl !== undefined) updates.thumbnailUrl = dto.thumbnailUrl;
    if (dto.syllabus !== undefined) updates.syllabus = dto.syllabus;

    await this.courseModel
      .findByIdAndUpdate(courseId, { $set: updates })
      .exec();

    const updated = await this.courseModel.findById(courseId).exec();
    return this.presentCourse(updated!, undefined);
  }

  async approveEnrollment(
    manager: AuthenticatedUser,
    courseId: string,
    requestId: string,
  ) {
    if (!(await this.access.canManageCourseForRequest(manager, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const req = await this.enrollmentModel.findById(requestId).exec();
    if (!req || req.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Enrollment request not found',
      });
    }

    req.status = EnrollmentRequestStatus.Approved;
    req.reviewedBy = new Types.ObjectId(manager.id);
    req.reviewedAt = new Date();
    await req.save();

    await this.membershipModel.findOneAndUpdate(
      { courseId: req.courseId, userId: req.userId },
      {
        $set: { role: CourseRole.Student, level: 1 },
        $setOnInsert: { courseId: req.courseId, userId: req.userId },
      },
      { upsert: true },
    );

    return { ok: true, status: EnrollmentRequestStatus.Approved };
  }
}
