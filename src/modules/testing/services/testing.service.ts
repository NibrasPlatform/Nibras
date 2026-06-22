import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '@modules/auth/schemas/user.schema';
import { Course } from '@modules/courses/schemas/course.schema';
import { CourseMembership } from '@modules/courses/schemas/course-membership.schema';
import { CourseLevel } from '@modules/courses/enums/course.enums';
import { ProgressionService } from '@modules/courses/services/progression.service';
import { CourseSection } from '@modules/course-content/schemas/course-section.schema';
import { CourseVideo } from '@modules/course-content/schemas/course-video.schema';
import { VideoProgress } from '@modules/course-content/schemas/video-progress.schema';
import { VideoEventType } from '@modules/course-content/enums/course-content.enums';

@Injectable()
export class TestingService {
  private readonly logger = new Logger(TestingService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(CourseMembership.name)
    private readonly membershipModel: Model<CourseMembership>,
    @InjectModel(CourseSection.name)
    private readonly sectionModel: Model<CourseSection>,
    @InjectModel(CourseVideo.name)
    private readonly videoModel: Model<CourseVideo>,
    @InjectModel(VideoProgress.name)
    private readonly progressModel: Model<VideoProgress>,
    private readonly progressionService: ProgressionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async completeVideo(
    _adminId: string,
    videoId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const video = await this.videoModel
      .findOne({ _id: videoId, isDeleted: false })
      .exec();
    if (!video) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Video not found',
      });
    }

    const section = await this.sectionModel.findById(video.sectionId).exec();
    if (!section) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Section not found for video',
      });
    }

    const uid = new Types.ObjectId(userId);
    await this.progressModel
      .findOneAndUpdate(
        { userId: uid, videoId: video._id },
        {
          $set: {
            watched: true,
            watchedProgress: 1,
            lastPositionSeconds: video.durationSeconds,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            userId: uid,
            videoId: video._id,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    try {
      await this.eventEmitter.emitAsync(VideoEventType.VideoCompleted, {
        videoId: video._id.toString(),
        courseId: section.courseId.toString(),
        userId,
        watched: true,
        watchedProgress: 1,
        lastPositionSeconds: video.durationSeconds,
      });
    } catch (eventError) {
      this.logger.error(
        `Event emission failed: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
      );
    }

    await this.progressionService.evaluateStudentLevel(userId);

    return { success: true };
  }

  async completeCourse(
    _adminId: string,
    courseId: string,
    userId: string,
  ): Promise<{ courseCompleted: boolean; levelChanged: boolean }> {
    const course = await this.courseModel
      .findOne({ _id: courseId, deletedAt: null })
      .exec();
    if (!course) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Course not found',
      });
    }

    const uid = new Types.ObjectId(userId);
    const cid = new Types.ObjectId(courseId);

    await this.membershipModel
      .findOneAndUpdate(
        { courseId: cid, userId: uid },
        {
          $set: { role: 'student', level: 1 },
          $setOnInsert: { courseId: cid, userId: uid },
        },
        { upsert: true },
      )
      .exec();

    const sections = await this.sectionModel
      .find({ courseId: cid, isDeleted: false })
      .select('_id')
      .exec();
    const sectionIds = sections.map((s) => s._id);

    const videos = await this.videoModel
      .find({ sectionId: { $in: sectionIds }, isDeleted: false })
      .select('_id durationSeconds')
      .exec();

    for (const video of videos) {
      await this.progressModel
        .findOneAndUpdate(
          { userId: uid, videoId: video._id },
          {
            $set: {
              watched: true,
              watchedProgress: 1,
              lastPositionSeconds: video.durationSeconds,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              userId: uid,
              videoId: video._id,
            },
          },
          { upsert: true },
        )
        .exec();
    }

    const user = await this.userModel.findById(userId).exec();
    const oldLevel = user?.currentLevel;
    const newLevel = await this.progressionService.evaluateStudentLevel(userId);

    return {
      courseCompleted: true,
      levelChanged: newLevel !== oldLevel,
    };
  }

  async completeLevel(
    _adminId: string,
    level: CourseLevel,
    userId: string,
  ): Promise<{ completedCourses: number; newLevel: CourseLevel }> {
    const courses = await this.courseModel
      .find({ level, isActive: true, deletedAt: null })
      .select('_id')
      .exec();

    for (const course of courses) {
      await this.completeCourse(_adminId, course._id.toString(), userId);
    }

    await this.progressionService.evaluateStudentLevel(userId);

    const user = await this.userModel.findById(userId).exec();
    return {
      completedCourses: courses.length,
      newLevel: user?.currentLevel ?? level,
    };
  }

  async setLevel(
    _adminId: string,
    userId: string,
    level: CourseLevel,
  ): Promise<{
    previousLevel: CourseLevel | undefined;
    newLevel: CourseLevel;
  }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const previousLevel = user.currentLevel;
    user.currentLevel = level;
    await user.save();

    return { previousLevel, newLevel: level };
  }

  async setTrack(
    _adminId: string,
    userId: string,
    trackId: string,
  ): Promise<{ success: boolean }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    user.selectedTrackId = new Types.ObjectId(trackId);
    await user.save();

    return { success: true };
  }

  async resetProgress(
    _adminId: string,
    userId: string,
  ): Promise<{ reset: boolean }> {
    const uid = new Types.ObjectId(userId);
    await this.progressModel.deleteMany({ userId: uid }).exec();
    await this.membershipModel.deleteMany({ userId: uid }).exec();
    await this.userModel
      .findByIdAndUpdate(userId, {
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      })
      .exec();

    return { reset: true };
  }
}
