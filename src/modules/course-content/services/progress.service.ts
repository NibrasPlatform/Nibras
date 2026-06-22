import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { ActivityEventService } from '@modules/gamification/services/activity-event.service';
import { UpdateProgressDto } from '../dto/course-content.dto';
import { Course } from '@modules/courses/schemas/course.schema';
import { CourseSection } from '../schemas/course-section.schema';
import {
  CourseVideo,
  CourseVideoDocument,
} from '../schemas/course-video.schema';
import { VideoProgress } from '../schemas/video-progress.schema';
import { CourseVideoStats } from '../schemas/course-video-stats.schema';
import { CourseStats } from '../schemas/course-stats.schema';
import { VideoEventType } from '../enums/course-content.enums';

const COMPLETION_THRESHOLD = 0.95;

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    @InjectModel(CourseSection.name)
    private readonly sectionModel: Model<CourseSection>,
    @InjectModel(CourseVideo.name)
    private readonly videoModel: Model<CourseVideo>,
    @InjectModel(VideoProgress.name)
    private readonly progressModel: Model<VideoProgress>,
    @InjectModel(CourseVideoStats.name)
    private readonly videoStatsModel: Model<CourseVideoStats>,
    @InjectModel(CourseStats.name)
    private readonly courseStatsModel: Model<CourseStats>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
    @InjectConnection() private readonly connection: Connection,
    private readonly access: CourseAccessService,
    private readonly activityEvent: ActivityEventService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async upsertProgress(
    user: AuthenticatedUser,
    courseId: string,
    videoId: string,
    dto: UpdateProgressDto,
  ) {
    if (!(await this.access.canViewCourseForRequest(user, courseId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' });
    }

    if (
      dto.watched === true &&
      (dto.watchedProgress ?? 0) < COMPLETION_THRESHOLD
    ) {
      throw new BadRequestException({
        code: 'INVALID_PROGRESS',
        message: `Cannot mark video as watched with watchedProgress below ${COMPLETION_THRESHOLD}`,
      });
    }

    const video = await this.getVideoOrThrow(videoId);
    const section = await this.sectionModel.findById(video.sectionId).exec();
    if (!section || section.courseId.toString() !== courseId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found in course',
      });
    }

    const isAtThreshold = (dto.watchedProgress ?? 0) >= COMPLETION_THRESHOLD;
    const watched = isAtThreshold ? true : (dto.watched ?? false);

    const progress = await this.progressModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(user.id),
          videoId: video._id,
        },
        {
          $set: {
            watched,
            watchedProgress: dto.watchedProgress ?? 0,
            lastPositionSeconds: dto.lastPositionSeconds ?? 0,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            userId: new Types.ObjectId(user.id),
            videoId: video._id,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    const eventType = progress.watched
      ? VideoEventType.VideoCompleted
      : progress.watchedProgress > 0
        ? VideoEventType.VideoProgressUpdated
        : VideoEventType.VideoStarted;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.updateVideoStats(video._id, session);
        await this.updateCourseStats(new Types.ObjectId(courseId), session);
      });
    } finally {
      await session.endSession();
    }

    const eventPayload = {
      videoId: video._id.toString(),
      courseId,
      userId: user.id,
      watched: progress.watched,
      watchedProgress: progress.watchedProgress,
      lastPositionSeconds: progress.lastPositionSeconds,
    };

    try {
      await this.eventEmitter.emitAsync(eventType, eventPayload);
    } catch (eventError) {
      this.logger.error(
        `Event emission failed for ${eventType}: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
      );
    }

    if (progress.watched) {
      try {
        await this.activityEvent.recordLessonCompleted({
          userId: user.id,
          videoId: video._id.toString(),
          courseId,
          sectionId: video.sectionId.toString(),
        });
      } catch (err) {
        this.logger.error(
          `Gamification award failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      try {
        const incompleteCount = await this.progressModel
          .countDocuments({
            videoId: { $in: await this.getSectionVideoIds(video.sectionId) },
            userId: new Types.ObjectId(user.id),
            watched: { $ne: true },
          })
          .exec();
        if (incompleteCount === 0) {
          await this.activityEvent.recordSectionCompleted({
            userId: user.id,
            sectionId: video.sectionId.toString(),
            courseId,
          });
        }
      } catch (err) {
        this.logger.error(
          `Gamification section award failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      try {
        const courseIncomplete = await this.progressModel
          .countDocuments({
            videoId: {
              $in: await this.getCourseVideoIds(new Types.ObjectId(courseId)),
            },
            userId: new Types.ObjectId(user.id),
            watched: { $ne: true },
          })
          .exec();
        if (courseIncomplete === 0) {
          const courseDoc = await this.courseModel.findById(courseId).exec();
          await this.activityEvent.recordCourseCompleted({
            userId: user.id,
            courseId,
            level: courseDoc?.level ?? 'beginner',
          });
        }
      } catch (err) {
        this.logger.error(
          `Gamification course award failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      videoId: progress.videoId.toString(),
      watched: progress.watched,
      watchedProgress: progress.watchedProgress,
      lastPositionSeconds: progress.lastPositionSeconds,
      updatedAt: progress.updatedAt.toISOString(),
      eventType,
    };
  }

  private async updateVideoStats(
    videoId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const [stats] = await this.progressModel
      .aggregate<{
        totalStudents: number;
        watchedCount: number;
        totalProgress: number;
      }>([
        { $match: { videoId } },
        {
          $group: {
            _id: null,
            totalStudents: { $sum: 1 },
            watchedCount: { $sum: { $cond: ['$watched', 1, 0] } },
            totalProgress: { $sum: '$watchedProgress' },
          },
        },
      ])
      .session(session ?? null)
      .exec();

    if (stats) {
      const avgProgress =
        stats.totalStudents > 0 ? stats.totalProgress / stats.totalStudents : 0;
      await this.videoStatsModel
        .findOneAndUpdate(
          { videoId },
          {
            $set: {
              totalStudents: stats.totalStudents,
              watchedCount: stats.watchedCount,
              completionRate:
                stats.totalStudents > 0
                  ? stats.watchedCount / stats.totalStudents
                  : 0,
              avgProgress,
            },
          },
          { upsert: true, session: session ?? undefined },
        )
        .exec();
    }
  }

  private async updateCourseStats(
    courseId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const sections = await this.sectionModel
      .find({ courseId, isDeleted: false })
      .select('_id')
      .session(session ?? null)
      .exec();
    const sectionIds = sections.map((s) => s._id);
    if (sectionIds.length === 0) return;

    const videos = await this.videoModel
      .find({ sectionId: { $in: sectionIds }, isDeleted: false })
      .select('_id')
      .session(session ?? null)
      .exec();
    const videoIds = videos.map((v) => v._id);

    if (videoIds.length === 0) return;

    const [globalStats] = await this.progressModel
      .aggregate<{
        totalStudents: number;
        totalWatchedProgress: number;
        totalWatchedCount: number;
        totalRecords: number;
      }>([
        { $match: { videoId: { $in: videoIds } } },
        {
          $group: {
            _id: null,
            totalStudents: { $addToSet: '$userId' },
            totalWatchedProgress: { $sum: '$watchedProgress' },
            totalWatchedCount: { $sum: { $cond: ['$watched', 1, 0] } },
            totalRecords: { $sum: 1 },
          },
        },
        {
          $project: {
            totalStudents: { $size: '$totalStudents' },
            totalWatchedProgress: 1,
            totalWatchedCount: 1,
            totalRecords: 1,
          },
        },
      ])
      .session(session ?? null)
      .exec();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeStudents = await this.progressModel
      .distinct('userId', {
        videoId: { $in: videoIds },
        updatedAt: { $gte: thirtyDaysAgo },
      })
      .session(session ?? null)
      .exec();

    const totalStudents = globalStats?.totalStudents ?? 0;
    const totalRecords = globalStats?.totalRecords ?? 0;
    const averageProgress =
      totalRecords > 0
        ? (globalStats?.totalWatchedProgress ?? 0) / totalRecords
        : 0;
    const completionRate =
      totalRecords > 0
        ? (globalStats?.totalWatchedCount ?? 0) / totalRecords
        : 0;

    await this.courseStatsModel
      .findOneAndUpdate(
        { courseId },
        {
          $set: {
            totalStudents,
            averageProgress,
            completionRate,
            activeStudentsLast30Days: activeStudents.length,
          },
        },
        { upsert: true, session: session ?? undefined },
      )
      .exec();
  }

  private async getSectionVideoIds(
    sectionId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const videos = await this.videoModel
      .find({ sectionId, isDeleted: false })
      .select('_id')
      .exec();
    return videos.map((v) => v._id);
  }

  private async getCourseVideoIds(
    courseId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const sections = await this.sectionModel
      .find({ courseId, isDeleted: false })
      .select('_id')
      .exec();
    const sectionIds = sections.map((s) => s._id);
    if (sectionIds.length === 0) return [];
    const videos = await this.videoModel
      .find({ sectionId: { $in: sectionIds }, isDeleted: false })
      .select('_id')
      .exec();
    return videos.map((v) => v._id);
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
}
