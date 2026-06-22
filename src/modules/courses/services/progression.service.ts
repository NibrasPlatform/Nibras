import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { User } from '@modules/auth/schemas/user.schema';
import { CourseLevel, CourseEventType } from '../enums/course.enums';
import { Course, CourseDocument } from '../schemas/course.schema';
import { CourseMembership } from '../schemas/course-membership.schema';
import { Track } from '../schemas/track.schema';

const LEVEL_ORDER = [
  CourseLevel.Beginner,
  CourseLevel.Intermediate,
  CourseLevel.Advanced,
  CourseLevel.Expert,
] as const;

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(CourseMembership.name)
    private readonly membershipModel: Model<CourseMembership>,
    @InjectModel(Track.name) private readonly trackModel: Model<Track>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async evaluateStudentLevel(userId: string): Promise<CourseLevel> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const maxLevel = LEVEL_ORDER[LEVEL_ORDER.length - 1];
    if (user.currentLevel === maxLevel) return user.currentLevel;

    const nextLevel = this.getNextLevel(user.currentLevel);
    if (!nextLevel) return user.currentLevel;

    const filter: Record<string, unknown> = {
      level: user.currentLevel,
      isActive: true,
      deletedAt: null,
    };

    if (this.isTrackLevel(user.currentLevel) && user.selectedTrackId) {
      filter.trackId = user.selectedTrackId;
    }

    const courses = await this.courseModel.find(filter).exec();
    if (courses.length === 0) return user.currentLevel;

    const allCompleted = await this.areCoursesCompleted(userId, courses);
    if (!allCompleted) return user.currentLevel;

    const updated = await this.userModel
      .findOneAndUpdate(
        { _id: user._id, currentLevel: user.currentLevel },
        { currentLevel: nextLevel },
        { new: true },
      )
      .exec();

    if (!updated) {
      return user.currentLevel;
    }

    const oldLevel = user.currentLevel;

    try {
      await this.eventEmitter.emitAsync(CourseEventType.LevelCompleted, {
        userId,
        level: oldLevel,
      });
      await this.eventEmitter.emitAsync(CourseEventType.LevelUnlocked, {
        userId,
        level: nextLevel,
      });
    } catch (err) {
      this.logger.error(
        `Event emission failed for level progression: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return nextLevel;
  }

  async getAvailableCourses(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    const userDoc = await this.userModel.findById(user.id).exec();
    if (!userDoc) return [];

    const filter: Record<string, unknown> = {
      level: userDoc.currentLevel,
      isActive: true,
      deletedAt: null,
    };

    if (this.isTrackLevel(userDoc.currentLevel)) {
      if (!userDoc.selectedTrackId) return [];
      filter.trackId = userDoc.selectedTrackId;
    }

    const courses = await this.courseModel
      .find(filter)
      .sort({ sortOrder: 1, title: 1 })
      .exec();

    const memberships = await this.membershipModel
      .find({
        userId: new Types.ObjectId(user.id),
        courseId: { $in: courses.map((c) => c._id) },
      })
      .exec();

    const enrolledIds = new Set(memberships.map((m) => m.courseId.toString()));

    return courses.map((c) => ({
      id: c._id.toString(),
      slug: c.slug,
      title: c.title,
      termLabel: c.termLabel,
      courseCode: c.courseCode,
      description: c.description,
      isPublic: c.isPublic,
      level: c.level,
      sortOrder: c.sortOrder,
      enrolled: enrolledIds.has(c._id.toString()),
    }));
  }

  async validateEnrollment(
    userId: string,
    course: CourseDocument,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const userLevelIdx = LEVEL_ORDER.indexOf(user.currentLevel);
    const courseLevelIdx = LEVEL_ORDER.indexOf(course.level);

    if (courseLevelIdx > userLevelIdx) {
      throw new BadRequestException({
        code: 'LEVEL_TOO_HIGH',
        message: `Course level ${course.level} is higher than your current level ${user.currentLevel}`,
      });
    }

    if (courseLevelIdx < userLevelIdx) {
      throw new BadRequestException({
        code: 'LEVEL_TOO_LOW',
        message: `Course level ${course.level} is below your current level ${user.currentLevel}`,
      });
    }

    if (this.isTrackLevel(course.level)) {
      if (!user.selectedTrackId) {
        throw new BadRequestException({
          code: 'TRACK_NOT_SELECTED',
          message:
            'You must select a track before enrolling in Advanced or Expert courses',
        });
      }

      if (!course.trackId || !user.selectedTrackId.equals(course.trackId)) {
        throw new BadRequestException({
          code: 'WRONG_TRACK',
          message: 'This course belongs to a different track',
        });
      }
    }
  }

  async adminRecalculate(userId: string): Promise<CourseLevel> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    let currentLevel = user.currentLevel;
    const maxLevel = LEVEL_ORDER[LEVEL_ORDER.length - 1];
    const completedLevels: CourseLevel[] = [];

    while (currentLevel !== maxLevel) {
      const nextLevel = this.getNextLevel(currentLevel);
      if (!nextLevel) break;

      const filter: Record<string, unknown> = {
        level: currentLevel,
        isActive: true,
        deletedAt: null,
      };

      if (this.isTrackLevel(currentLevel) && user.selectedTrackId) {
        filter.trackId = user.selectedTrackId;
      }

      const courses = await this.courseModel.find(filter).exec();
      if (courses.length === 0) break;

      const allCompleted = await this.areCoursesCompleted(userId, courses);
      if (!allCompleted) break;

      completedLevels.push(currentLevel);
      currentLevel = nextLevel;
    }

    if (currentLevel !== user.currentLevel) {
      user.currentLevel = currentLevel;
      await user.save();

      for (const completed of completedLevels) {
        const unlocked = this.getNextLevel(completed);
        if (!unlocked) continue;
        try {
          await this.eventEmitter.emitAsync(CourseEventType.LevelCompleted, {
            userId,
            level: completed,
          });
          await this.eventEmitter.emitAsync(CourseEventType.LevelUnlocked, {
            userId,
            level: unlocked,
          });
        } catch (err) {
          this.logger.error(
            `Event emission failed during admin recalculate: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return user.currentLevel;
  }

  async adminOverrideTrack(
    _adminId: string,
    userId: string,
    trackId: string | null,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (trackId) {
      if (!Types.ObjectId.isValid(trackId)) {
        throw new BadRequestException({
          code: 'INVALID_TRACK_ID',
          message: 'Invalid track ID format',
        });
      }
      const track = await this.trackModel.findById(trackId).exec();
      if (!track) {
        throw new NotFoundException({
          code: 'TRACK_NOT_FOUND',
          message: 'Track not found',
        });
      }
      user.selectedTrackId = new Types.ObjectId(trackId);
    } else {
      user.selectedTrackId = null;
    }

    await user.save();
  }

  validateTrackLevelConsistency(courseData: Partial<Course>): void {
    const isTrackLevel = this.isTrackLevel(
      (courseData as { level?: CourseLevel }).level ?? CourseLevel.Beginner,
    );
    const hasTrackId = !!(courseData as { trackId?: Types.ObjectId | null })
      .trackId;

    if (!isTrackLevel && hasTrackId) {
      throw new BadRequestException({
        code: 'INVALID_TRACK',
        message:
          'Beginner and Intermediate courses must not have a track assigned',
      });
    }

    if (isTrackLevel && !hasTrackId) {
      throw new BadRequestException({
        code: 'TRACK_REQUIRED',
        message: 'Advanced and Expert courses must have a track assigned',
      });
    }
  }

  private async areCoursesCompleted(
    userId: string,
    courses: CourseDocument[],
  ): Promise<boolean> {
    for (const course of courses) {
      try {
        const sectionModel = this.courseModel.db.model('CourseSection');
        const videoModel = this.courseModel.db.model('CourseVideo');
        const progressModel = this.courseModel.db.model('VideoProgress');

        const sections = await sectionModel
          .find({ courseId: course._id, isDeleted: false })
          .select('_id')
          .exec();

        const sectionIds = sections.map((s: { _id: Types.ObjectId }) => s._id);

        const videos = await videoModel
          .find({
            sectionId: { $in: sectionIds },
            isDeleted: false,
            isPublished: true,
          })
          .select('_id')
          .exec();

        if (videos.length === 0) continue;

        const membership = await this.membershipModel
          .findOne({
            courseId: course._id,
            userId: new Types.ObjectId(userId),
          })
          .exec();

        if (!membership) return false;

        const videoIds = videos.map((v: { _id: Types.ObjectId }) => v._id);

        const completedVideos = await progressModel
          .countDocuments({
            videoId: { $in: videoIds },
            userId: new Types.ObjectId(userId),
            watched: true,
          })
          .exec();

        if (completedVideos < videos.length) return false;
      } catch {
        return false;
      }
    }

    return true;
  }

  private getNextLevel(level: CourseLevel): CourseLevel | null {
    const idx = LEVEL_ORDER.indexOf(level);
    return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
  }

  private isTrackLevel(level: CourseLevel): boolean {
    return level === CourseLevel.Advanced || level === CourseLevel.Expert;
  }
}
