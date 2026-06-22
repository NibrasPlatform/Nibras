import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { Course } from '@modules/courses/schemas/course.schema';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import {
  CreateVideoDto,
  UpdateVideoDto,
  ReorderVideosDto,
} from '../dto/course-content.dto';
import {
  CourseSection,
  CourseSectionDocument,
} from '../schemas/course-section.schema';
import {
  CourseVideo,
  CourseVideoDocument,
} from '../schemas/course-video.schema';
import { VideoProgress } from '../schemas/video-progress.schema';
import { normalizeYouTubeEmbedUrl } from '../utils/youtube.util';

@Injectable()
export class VideosService {
  constructor(
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(CourseSection.name)
    private readonly sectionModel: Model<CourseSection>,
    @InjectModel(CourseVideo.name)
    private readonly videoModel: Model<CourseVideo>,
    @InjectModel(VideoProgress.name)
    private readonly progressModel: Model<VideoProgress>,
    private readonly coursesService: CoursesService,
    private readonly access: CourseAccessService,
  ) {}

  async create(
    user: AuthenticatedUser,
    courseId: string,
    sectionId: string,
    dto: CreateVideoDto,
  ) {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const section = await this.getSectionOrThrow(sectionId);
    if (section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Section not found in course',
      });
    }

    const embedUrl = normalizeYouTubeEmbedUrl(dto.embedUrl);

    if (dto.requiresVideoId) {
      if (!Types.ObjectId.isValid(dto.requiresVideoId)) {
        throw new BadRequestException({
          code: 'INVALID_REQUIRES_VIDEO_ID',
          message: 'requiresVideoId must be a valid video id',
        });
      }

      const prereqVideo = await this.videoModel
        .findOne({ _id: dto.requiresVideoId, isDeleted: false })
        .select('sectionId')
        .exec();
      if (!prereqVideo) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Prerequisite video not found',
        });
      }

      const prereqSection = await this.sectionModel
        .findById(prereqVideo.sectionId)
        .select('courseId')
        .exec();
      if (!prereqSection || prereqSection.courseId.toString() !== courseId) {
        throw new BadRequestException({
          code: 'INVALID_REQUIRES_VIDEO_ID',
          message: 'Prerequisite video must belong to the same course',
        });
      }

      await this.requireNoCircularDependency(dto.requiresVideoId, null);
    }

    if (dto.linkedProjectId && !Types.ObjectId.isValid(dto.linkedProjectId)) {
      throw new BadRequestException({
        code: 'INVALID_LINKED_PROJECT_ID',
        message: 'linkedProjectId must be a valid ObjectId',
      });
    }

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const max = await this.videoModel
        .findOne({
          sectionId: new Types.ObjectId(sectionId),
          isDeleted: false,
        })
        .sort({ sortOrder: -1 })
        .select('sortOrder')
        .exec();
      sortOrder = (max?.sortOrder ?? -1) + 1;
    }

    const video = await this.videoModel.create({
      sectionId: new Types.ObjectId(sectionId),
      title: dto.title,
      description: dto.description ?? '',
      provider: dto.provider,
      externalId: dto.externalId,
      embedUrl,
      durationSeconds: dto.durationSeconds ?? 0,
      sortOrder,
      requiresVideoId: dto.requiresVideoId
        ? new Types.ObjectId(dto.requiresVideoId)
        : null,
      linkedProjectId: dto.linkedProjectId
        ? new Types.ObjectId(dto.linkedProjectId)
        : null,
      resources: dto.resources ?? [],
    });

    return {
      id: video._id.toString(),
      sectionId: video.sectionId.toString(),
      title: video.title,
      description: video.description || undefined,
      provider: video.provider,
      externalId: video.externalId,
      embedUrl: video.embedUrl,
      durationSeconds: video.durationSeconds,
      sortOrder: video.sortOrder,
      isPublished: video.isPublished,
      requiresVideoId: video.requiresVideoId?.toString() ?? null,
      linkedProjectId: video.linkedProjectId?.toString() ?? null,
      resources: video.resources,
    };
  }

  async update(
    user: AuthenticatedUser,
    courseId: string,
    videoId: string,
    dto: UpdateVideoDto,
  ) {
    const video = await this.getVideoOrThrow(videoId);
    const section = await this.sectionModel.findById(video.sectionId).exec();
    if (!section || section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found in course',
      });
    }
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    if (dto.title !== undefined) video.title = dto.title;
    if (dto.description !== undefined) video.description = dto.description;
    if (dto.provider !== undefined) video.provider = dto.provider;
    if (dto.externalId !== undefined) video.externalId = dto.externalId;
    if (dto.embedUrl !== undefined) {
      video.embedUrl = normalizeYouTubeEmbedUrl(dto.embedUrl);
    }
    if (dto.durationSeconds !== undefined)
      video.durationSeconds = dto.durationSeconds;
    if (dto.sortOrder !== undefined) video.sortOrder = dto.sortOrder;
    if (dto.isPublished !== undefined) video.isPublished = dto.isPublished;
    if (dto.requiresVideoId !== undefined) {
      if (dto.requiresVideoId) {
        await this.requireNoCircularDependency(
          dto.requiresVideoId,
          video._id.toString(),
        );
      }
      video.requiresVideoId = dto.requiresVideoId
        ? new Types.ObjectId(dto.requiresVideoId)
        : null;
    }
    if (dto.linkedProjectId !== undefined) {
      video.linkedProjectId = dto.linkedProjectId
        ? new Types.ObjectId(dto.linkedProjectId)
        : null;
    }
    if (dto.resources !== undefined) {
      video.resources = dto.resources.map((r) => ({
        label: r.label,
        url: r.url,
        type: r.type ?? '',
      }));
    }
    await video.save();

    return {
      id: video._id.toString(),
      sectionId: video.sectionId.toString(),
      title: video.title,
      description: video.description || undefined,
      provider: video.provider,
      externalId: video.externalId,
      embedUrl: video.embedUrl,
      durationSeconds: video.durationSeconds,
      sortOrder: video.sortOrder,
      isPublished: video.isPublished,
      requiresVideoId: video.requiresVideoId?.toString() ?? null,
      linkedProjectId: video.linkedProjectId?.toString() ?? null,
      resources: video.resources,
    };
  }

  async delete(user: AuthenticatedUser, courseId: string, videoId: string) {
    const video = await this.getVideoOrThrow(videoId);
    const section = await this.sectionModel.findById(video.sectionId).exec();
    if (!section || section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found in course',
      });
    }
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    video.isDeleted = true;
    video.deletedAt = new Date();
    await video.save();

    return { ok: true };
  }

  async detail(user: AuthenticatedUser, courseId: string, videoId: string) {
    const video = await this.getVideoOrThrow(videoId);
    const section = await this.sectionModel.findById(video.sectionId).exec();
    if (!section || section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found in course',
      });
    }

    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const isManager = await this.access.canManageCourseForRequest(
      user,
      courseId,
    );
    if (!video.isPublished && !isManager) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found',
      });
    }

    const progress = await this.progressModel
      .findOne({
        videoId: video._id,
        userId: new Types.ObjectId(user.id),
      })
      .exec();

    const locked = await this.isLocked(user, courseId, video);
    if (locked && !isManager) {
      throw new ForbiddenException({
        code: 'VIDEO_LOCKED',
        message: 'Complete the prerequisite video first',
      });
    }

    return {
      id: video._id.toString(),
      sectionId: video.sectionId.toString(),
      title: video.title,
      description: video.description || undefined,
      provider: video.provider,
      externalId: video.externalId,
      embedUrl: video.embedUrl,
      durationSeconds: video.durationSeconds,
      sortOrder: video.sortOrder,
      isPublished: video.isPublished,
      requiresVideoId: video.requiresVideoId?.toString() ?? null,
      linkedProjectId: video.linkedProjectId?.toString() ?? null,
      resources: video.resources,
      progress: progress
        ? {
            watched: progress.watched,
            watchedProgress: progress.watchedProgress,
            lastPositionSeconds: progress.lastPositionSeconds,
          }
        : {
            watched: false,
            watchedProgress: 0,
            lastPositionSeconds: 0,
          },
      locked,
    };
  }

  async reorder(
    user: AuthenticatedUser,
    courseId: string,
    dto: ReorderVideosDto,
  ) {
    await this.coursesService.assertCourseExists(courseId);
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    const sortOrders = dto.videos.map((v) => v.sortOrder);
    if (new Set(sortOrders).size !== sortOrders.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_SORT_ORDER',
        message: 'Duplicate sortOrder values are not allowed',
      });
    }

    const videoDocs = await this.videoModel
      .find({
        _id: { $in: dto.videos.map((v) => new Types.ObjectId(v.id)) },
        isDeleted: false,
      })
      .exec();

    if (videoDocs.length !== dto.videos.length) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Some videos not found in course',
      });
    }

    const uniqueSectionIds = [
      ...new Set(videoDocs.map((v) => v.sectionId.toString())),
    ];
    const sections = await this.sectionModel
      .find({
        _id: { $in: uniqueSectionIds.map((id) => new Types.ObjectId(id)) },
        courseId: new Types.ObjectId(courseId),
      })
      .exec();

    if (sections.length !== uniqueSectionIds.length) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Some videos not found in course',
      });
    }

    const ops = dto.videos.map(({ id, sortOrder }) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(id),
          isDeleted: false,
        },
        update: { $set: { sortOrder } },
      },
    }));

    if (ops.length > 0) {
      await this.videoModel.bulkWrite(ops);
    }

    const dupes = await this.videoModel
      .aggregate([
        {
          $match: {
            sectionId: { $in: videoDocs.map((v) => v.sectionId) },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: { sectionId: '$sectionId', sortOrder: '$sortOrder' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ])
      .exec();

    if (dupes.length > 0) {
      throw new BadRequestException({
        code: 'DUPLICATE_SORT_ORDER',
        message:
          'Reorder resulted in duplicate sortOrder values within a section',
      });
    }

    return { ok: true };
  }

  async isLocked(
    user: AuthenticatedUser,
    courseId: string,
    video: CourseVideoDocument,
  ): Promise<boolean> {
    const course = await this.courseModel.findById(courseId).exec();
    if (!course?.sequentialVideos) return false;
    if (!video.requiresVideoId) return false;

    const progress = await this.progressModel
      .findOne({
        videoId: video.requiresVideoId,
        userId: new Types.ObjectId(user.id),
        watched: true,
      })
      .exec();

    return !progress;
  }

  private async requireNoCircularDependency(
    targetVideoId: string,
    currentVideoId: string | null,
  ): Promise<void> {
    const visited = new Set<string>();
    let cursor: string | null = targetVideoId;

    while (cursor) {
      if (currentVideoId && cursor === currentVideoId) {
        throw new BadRequestException({
          code: 'CIRCULAR_DEPENDENCY',
          message: 'Circular dependency detected in requiresVideoId chain',
        });
      }
      if (visited.has(cursor)) {
        throw new BadRequestException({
          code: 'CIRCULAR_DEPENDENCY',
          message: 'Circular dependency detected in requiresVideoId chain',
        });
      }
      visited.add(cursor);

      if (!Types.ObjectId.isValid(cursor)) break;
      const prereq = await this.videoModel
        .findOne({ _id: cursor, isDeleted: false })
        .select('requiresVideoId')
        .exec();
      if (!prereq?.requiresVideoId) break;
      cursor = prereq.requiresVideoId.toString();
    }
  }

  private async getVideoOrThrow(videoId: string): Promise<CourseVideoDocument> {
    if (!Types.ObjectId.isValid(videoId)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found',
      });
    }
    const video = await this.videoModel
      .findOne({ _id: videoId, isDeleted: false })
      .exec();
    if (!video) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found',
      });
    }
    return video;
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
