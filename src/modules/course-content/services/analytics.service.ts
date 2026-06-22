import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import { CourseSection } from '../schemas/course-section.schema';
import { CourseVideo } from '../schemas/course-video.schema';
import { CourseVideoStats } from '../schemas/course-video-stats.schema';
import { CourseStats } from '../schemas/course-stats.schema';
import type {
  VideoAnalyticsResponseDto,
  CourseAnalyticsResponseDto,
} from '../dto/course-content.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(CourseSection.name)
    private readonly sectionModel: Model<CourseSection>,
    @InjectModel(CourseVideo.name)
    private readonly videoModel: Model<CourseVideo>,
    @InjectModel(CourseVideoStats.name)
    private readonly videoStatsModel: Model<CourseVideoStats>,
    @InjectModel(CourseStats.name)
    private readonly courseStatsModel: Model<CourseStats>,
    private readonly coursesService: CoursesService,
    private readonly access: CourseAccessService,
  ) {}

  async getVideoAnalytics(
    user: AuthenticatedUser,
    courseId: string,
  ): Promise<VideoAnalyticsResponseDto[]> {
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Course management access required',
      });
    }
    await this.coursesService.assertCourseExists(courseId);

    const sections = await this.sectionModel
      .find({ courseId: new Types.ObjectId(courseId), isDeleted: false })
      .select('_id')
      .exec();
    const sectionIds = sections.map((s) => s._id);

    const videos = await this.videoModel
      .find({ sectionId: { $in: sectionIds }, isDeleted: false })
      .select('_id title')
      .exec();

    const videoIds = videos.map((v) => v._id);

    const statsMap = new Map(
      (
        await this.videoStatsModel.find({ videoId: { $in: videoIds } }).exec()
      ).map((s) => [s.videoId.toString(), s]),
    );

    return videos.map((v) => {
      const stats = statsMap.get(v._id.toString());
      return {
        videoId: v._id.toString(),
        title: v.title,
        totalStudents: stats?.totalStudents ?? 0,
        watchedCount: stats?.watchedCount ?? 0,
        completionRate: stats?.completionRate ?? 0,
        avgProgress: stats?.avgProgress ?? 0,
      };
    });
  }

  async getCourseAnalytics(
    user: AuthenticatedUser,
    courseId: string,
  ): Promise<CourseAnalyticsResponseDto> {
    if (!(await this.access.canManageCourseForRequest(user, courseId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Course management access required',
      });
    }
    await this.coursesService.assertCourseExists(courseId);

    const stats = await this.courseStatsModel
      .findOne({ courseId: new Types.ObjectId(courseId) })
      .exec();

    return {
      totalStudents: stats?.totalStudents ?? 0,
      completionRate: stats?.completionRate ?? 0,
      averageProgress: stats?.averageProgress ?? 0,
      activeStudentsLast30Days: stats?.activeStudentsLast30Days ?? 0,
    };
  }
}
