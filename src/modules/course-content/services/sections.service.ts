import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import {
  CreateSectionDto,
  UpdateSectionDto,
  ReorderSectionsDto,
} from '../dto/course-content.dto';
import {
  CourseSection,
  CourseSectionDocument,
} from '../schemas/course-section.schema';
import { CourseVideo } from '../schemas/course-video.schema';

@Injectable()
export class SectionsService {
  constructor(
    @InjectModel(CourseSection.name)
    private readonly sectionModel: Model<CourseSection>,
    @InjectModel(CourseVideo.name)
    private readonly videoModel: Model<CourseVideo>,
    private readonly coursesService: CoursesService,
    private readonly access: CourseAccessService,
  ) {}

  async list(
    user: AuthenticatedUser,
    courseId: string,
  ): Promise<Record<string, unknown>[]> {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }
    const isManager = await this.access.canManageCourseForRequest(
      user,
      courseId,
    );

    const sections = await this.sectionModel
      .find({
        courseId: new Types.ObjectId(courseId),
        isDeleted: false,
        ...(isManager ? {} : { isPublished: true }),
      })
      .sort({ sortOrder: 1 })
      .exec();

    const videos = await this.videoModel
      .find({
        sectionId: { $in: sections.map((s) => s._id) },
        isDeleted: false,
        ...(isManager ? {} : { isPublished: true }),
      })
      .sort({ sortOrder: 1 })
      .exec();

    const videosBySection = new Map<string, typeof videos>();
    for (const v of videos) {
      const key = v.sectionId.toString();
      if (!videosBySection.has(key)) videosBySection.set(key, []);
      videosBySection.get(key)!.push(v);
    }

    return sections.map((s) => ({
      id: s._id.toString(),
      courseId: s.courseId.toString(),
      title: s.title,
      description: s.description || undefined,
      sortOrder: s.sortOrder,
      isPublished: s.isPublished,
      videos: (videosBySection.get(s._id.toString()) ?? []).map((v) => ({
        id: v._id.toString(),
        sectionId: v.sectionId.toString(),
        title: v.title,
        description: v.description || undefined,
        provider: v.provider,
        externalId: v.externalId,
        embedUrl: v.embedUrl,
        durationSeconds: v.durationSeconds,
        sortOrder: v.sortOrder,
        isPublished: v.isPublished,
        requiresVideoId: v.requiresVideoId?.toString() ?? null,
        linkedProjectId: v.linkedProjectId?.toString() ?? null,
        resources: v.resources,
      })),
    }));
  }

  async create(
    user: AuthenticatedUser,
    courseId: string,
    dto: CreateSectionDto,
  ) {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const max = await this.sectionModel
        .findOne({ courseId: new Types.ObjectId(courseId), isDeleted: false })
        .sort({ sortOrder: -1 })
        .select('sortOrder')
        .exec();
      sortOrder = (max?.sortOrder ?? -1) + 1;
    }

    const section = await this.sectionModel.create({
      courseId: new Types.ObjectId(courseId),
      title: dto.title,
      description: dto.description ?? '',
      sortOrder,
    });

    return {
      id: section._id.toString(),
      courseId: section.courseId.toString(),
      title: section.title,
      description: section.description || undefined,
      sortOrder: section.sortOrder,
      isPublished: section.isPublished,
    };
  }

  async update(
    user: AuthenticatedUser,
    courseId: string,
    sectionId: string,
    dto: UpdateSectionDto,
  ) {
    const section = await this.getSectionOrThrow(sectionId);
    if (section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Section not found',
      });
    }
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    if (dto.title !== undefined) section.title = dto.title;
    if (dto.description !== undefined) section.description = dto.description;
    if (dto.sortOrder !== undefined) section.sortOrder = dto.sortOrder;
    if (dto.isPublished !== undefined) section.isPublished = dto.isPublished;
    await section.save();

    return {
      id: section._id.toString(),
      courseId: section.courseId.toString(),
      title: section.title,
      description: section.description || undefined,
      sortOrder: section.sortOrder,
      isPublished: section.isPublished,
    };
  }

  async delete(user: AuthenticatedUser, courseId: string, sectionId: string) {
    const section = await this.getSectionOrThrow(sectionId);
    if (section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Section not found',
      });
    }
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    section.isDeleted = true;
    section.deletedAt = new Date();
    await section.save();

    await this.videoModel
      .updateMany(
        { sectionId: section._id },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      )
      .exec();

    return { ok: true };
  }

  async reorder(
    user: AuthenticatedUser,
    courseId: string,
    dto: ReorderSectionsDto,
  ) {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const sortOrders = dto.sections.map((s) => s.sortOrder);
    if (new Set(sortOrders).size !== sortOrders.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_SORT_ORDER',
        message: 'Duplicate sortOrder values are not allowed',
      });
    }

    const ops = dto.sections.map(({ id, sortOrder }) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(id),
          courseId: new Types.ObjectId(courseId),
          isDeleted: false,
        },
        update: { $set: { sortOrder } },
      },
    }));

    if (ops.length > 0) {
      await this.sectionModel.bulkWrite(ops);
    }

    const dupes = await this.sectionModel
      .aggregate([
        {
          $match: {
            courseId: new Types.ObjectId(courseId),
            isDeleted: false,
          },
        },
        { $group: { _id: '$sortOrder', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ])
      .exec();

    if (dupes.length > 0) {
      throw new BadRequestException({
        code: 'DUPLICATE_SORT_ORDER',
        message: 'Reorder resulted in duplicate sortOrder values',
      });
    }

    return { ok: true };
  }

  private async getSectionOrThrow(
    sectionId: string,
  ): Promise<CourseSectionDocument> {
    if (!Types.ObjectId.isValid(sectionId)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Section not found',
      });
    }
    const section = await this.sectionModel
      .findOne({ _id: sectionId, isDeleted: false })
      .exec();
    if (!section) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Section not found',
      });
    }
    return section;
  }
}
